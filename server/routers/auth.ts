import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../trpc";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeEmail, checkTldTypo } from "../utils/email";
import { isAtLeastAge, isFutureDate, isValidStateCode } from "../utils/validators";
import { encryptSSN } from "../utils/ssn";
import { isStrongPassword, passwordFailureReason } from "../utils/password";
import { formatToE164 } from "../utils/phone";

export const authRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        // accept original casing from client; we'll normalize server-side
        email: z.string().email(),
        password: z.string().min(12).refine((p) => isStrongPassword(p), {
          message:
            "Password must be at least 12 characters and include uppercase, lowercase, a number, and a special character",
        }),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        phoneNumber: z.string().refine((val) => {
          // validate and normalize to E.164; require a valid international phone
          const formatted = formatToE164(val);
          return formatted !== null;
        }, { message: "Invalid phone number; use international format like +15551234567" }),
        dateOfBirth: z.string().refine((val) => {
          // must be a valid date, not in future, and at least 18 years old
          if (isFutureDate(val)) return false;
          return isAtLeastAge(val, 18);
        }, { message: "You must be at least 18 years old and provide a valid birth date" }),
        ssn: z.string().regex(/^\d{9}$/),
        address: z.string().min(1),
        city: z.string().min(1),
        state: z.string().length(2).transform((s) => s.toUpperCase()).refine((s) => isValidStateCode(s), {
          message: "Invalid US state code",
        }),
        zipCode: z.string().regex(/^\d{5}$/),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const normalizedEmail = normalizeEmail(input.email);

      const suggested = checkTldTypo(normalizedEmail);
      if (suggested) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Did you mean .${suggested}?` });
      }

      const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Encrypt SSN before storing
      const encryptedSsn = encryptSSN(input.ssn);

      await db.insert(users).values({
        ...input,
        email: normalizedEmail,
        password: hashedPassword,
        ssn: encryptedSsn,
      });

      // Fetch the created user
      const user = await db.select().from(users).where(eq(users.email, normalizedEmail)).get();

      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user",
        });
      }

      // Create session
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || "temporary-secret-for-interview", {
        expiresIn: "7d",
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Invalidate any existing sessions for this user before creating a new one
      try {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
      } catch (e) {
        // log but continue
        console.warn("Failed to clear existing sessions for user", user.id, e);
      }

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      // Set cookie
      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      } else {
        (ctx.res as Headers).set("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      }

      // Never return SSN in API responses
      if (user) user.ssn = undefined as any;
      return { user: { ...user, password: undefined }, token };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const user = await db.select().from(users).where(eq(users.email, input.email)).get();

      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const validPassword = await bcrypt.compare(input.password, user.password);

      if (!validPassword) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || "temporary-secret-for-interview", {
        expiresIn: "7d",
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Invalidate other sessions for this user to enforce single active session
      try {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
      } catch (e) {
        console.warn("Failed to clear existing sessions for user", user.id, e);
      }

      await db.insert(sessions).values({
        userId: user.id,
        token,
        expiresAt: expiresAt.toISOString(),
      });

      if ("setHeader" in ctx.res) {
        ctx.res.setHeader("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      } else {
        (ctx.res as Headers).set("Set-Cookie", `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
      }

      if (user) user.ssn = undefined as any;
      return { user: { ...user, password: undefined }, token };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.user) {
      // Delete session from database
      let token: string | undefined;
      if ("cookies" in ctx.req) {
        token = (ctx.req as any).cookies.session;
      } else {
        const cookieHeader = ctx.req.headers.get?.("cookie") || (ctx.req.headers as any).cookie;
        token = cookieHeader
          ?.split("; ")
          .find((c: string) => c.startsWith("session="))
          ?.split("=")[1];
      }
      if (token) {
        await db.delete(sessions).where(eq(sessions.token, token));
      }
    }

    if ("setHeader" in ctx.res) {
      ctx.res.setHeader("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    } else {
      (ctx.res as Headers).set("Set-Cookie", `session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    }

    return { success: true, message: ctx.user ? "Logged out successfully" : "No active session" };
  }),
  // Invalidate all sessions for the current authenticated user
  invalidateSessions: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
    }

    try {
      await db.delete(sessions).where(eq(sessions.userId, ctx.user.id));
      return { success: true, message: "All sessions invalidated" };
    } catch (e) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to invalidate sessions" });
    }
  }),
});
