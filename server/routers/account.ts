import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { isValidCardNumber } from "../utils/payment";
import { isValidRoutingNumber } from "../utils/routing";

function generateAccountNumber(): string {
  const n = crypto.randomInt(0, 10_000_000_000);
  return n.toString().padStart(10, "0");
}

export const accountRouter = router({
  createAccount: protectedProcedure
    .input(
      z.object({
        accountType: z.enum(["checking", "savings"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check if user already has an account of this type
      const existingAccount = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, ctx.user.id), eq(accounts.accountType, input.accountType)))
        .get();

      if (existingAccount) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `You already have a ${input.accountType} account`,
        });
      }

      let accountNumber;
      let isUnique = false;

      // Generate unique account number
      while (!isUnique) {
        accountNumber = generateAccountNumber();
        const existing = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber)).get();
        isUnique = !existing;
      }

      await db.insert(accounts).values({
        userId: ctx.user.id,
        accountNumber: accountNumber!,
        accountType: input.accountType,
        balance: 0,
        status: "active",
      });

      // Fetch the created account; if insert didn't persist, treat as failure
      const created = await db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber!)).get();
      if (!created) {
        // Log and throw an error so the client doesn't assume a fake balance
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account" });
      }

      return created;
    }),

  getAccounts: protectedProcedure.query(async ({ ctx }) => {
    const userAccounts = await db.select().from(accounts).where(eq(accounts.userId, ctx.user.id));

    return userAccounts;
  }),

  fundAccount: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        // accept either a number or a string so we can validate incoming formatting
        amount: z.union([z.number(), z.string()]),
        fundingSource: z.object({
          type: z.enum(["card", "bank"]),
          accountNumber: z.string(),
          routingNumber: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Coerce/validate amount. If a string was provided, validate formatting (no multiple leading zeros)
      let amount: number;
      if (typeof input.amount === "string") {
        const { parseAndNormalizeAmount } = await import("../utils/amount");
        const parsed = parseAndNormalizeAmount(input.amount);
        if (parsed === null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid amount format" });
        }
        amount = parsed;
      } else {
        amount = Math.round(Number(input.amount) * 100) / 100;
      }

      if (isNaN(amount) || amount < 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Amount must be at least $0.01" });
      }

      // Validate funding source details
      if (input.fundingSource.type === "card") {
        if (!isValidCardNumber(input.fundingSource.accountNumber)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid card number" });
        }
      } else if (input.fundingSource.type === "bank") {
        // Basic bank account number check (digits only)
        if (!/^\d+$/.test(input.fundingSource.accountNumber)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid bank account number" });
        }

        // Require routing number for ACH/bank transfers
        if (!input.fundingSource.routingNumber) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Routing number is required for bank transfers" });
        }

        // Validate routing number format and checksum
        if (!isValidRoutingNumber(input.fundingSource.routingNumber)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid routing number" });
        }
      }

      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      if (account.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Account is not active",
        });
      }

      // Create transaction
      await db.insert(transactions).values({
        accountId: input.accountId,
        type: "deposit",
        amount,
        description: `Funding from ${input.fundingSource.type}`,
        status: "completed",
        processedAt: new Date().toISOString(),
      });

      // Fetch the created transaction for this account. We intentionally select by account
      // and pick the most-recent `createdAt` row in JS to avoid relying on DB-specific
      // orderBy semantics across drivers.
      const recentForAccount = await db.select().from(transactions).where(eq(transactions.accountId, input.accountId));
      let transaction = null as any;
      if (recentForAccount && recentForAccount.length > 0) {
        transaction = recentForAccount.reduce((best: any, cur: any) => {
          const bestTime = new Date(best.createdAt).getTime();
          const curTime = new Date(cur.createdAt).getTime();
          return curTime > bestTime ? cur : best;
        }, recentForAccount[0]);
      }

      // Update account balance using integer cents arithmetic to avoid float drift.
      const currentCents = Math.round(Number(account.balance) * 100);
      const amountCents = Math.round(Number(amount) * 100);
      const newCents = currentCents + amountCents;

      await db
        .update(accounts)
        .set({
          balance: newCents / 100,
        })
        .where(eq(accounts.id, input.accountId));

      return {
        transaction,
        newBalance: newCents / 100,
      };
    }),

  getTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
        page: z.number().nonnegative().optional(),
        pageSize: z.number().positive().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify account belongs to user
      const account = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id)))
        .get();

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      }

      // Pagination defaults
      const page = input.page ?? 0;
      const pageSize = Math.min(input.pageSize ?? 50, 500);

      // Use a single SQL query with ORDER BY and LIMIT/OFFSET to let the DB optimize
      const accountTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, input.accountId))
        .orderBy(sql`COALESCE(${transactions.processedAt}, ${transactions.createdAt}) DESC, ${transactions.createdAt} DESC, ${transactions.id} DESC`)
        .limit(pageSize)
        .offset(page * pageSize);

      // Fetch account details once to enrich transactions
      const accountDetails = await db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();

      const enrichedTransactions = accountTransactions.map((transaction: any) => ({
        ...transaction,
        accountType: accountDetails?.accountType,
      }));

      return enrichedTransactions;
    }),
});
