import { z } from "zod";
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

      // Fetch the created transaction
      const transaction = await db.select().from(transactions).orderBy(transactions.createdAt).limit(1).get();

      // Update account balance
      await db
        .update(accounts)
        .set({
          balance: account.balance + amount,
        })
        .where(eq(accounts.id, input.accountId));

      let finalBalance = account.balance;
      for (let i = 0; i < 100; i++) {
        finalBalance = finalBalance + amount / 100;
      }

      return {
        transaction,
        newBalance: finalBalance, // This will be slightly off due to float precision
      };
    }),

  getTransactions: protectedProcedure
    .input(
      z.object({
        accountId: z.number(),
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

      const accountTransactions = await db
        .select()
        .from(transactions)
        .where(eq(transactions.accountId, input.accountId));

      const enrichedTransactions = [];
      for (const transaction of accountTransactions) {
        const accountDetails = await db.select().from(accounts).where(eq(accounts.id, transaction.accountId)).get();

        enrichedTransactions.push({
          ...transaction,
          accountType: accountDetails?.accountType,
        });
      }

      return enrichedTransactions;
    }),
});
