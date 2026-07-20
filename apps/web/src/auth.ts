/**
 * Auth.js config (specs/06-auth.md): Google OAuth + email magic link, no
 * passwords, database-backed sessions with 30-day rolling expiry.
 *
 * DrizzleAdapter is wired to our own table names (apps/web/src/db/schema.ts),
 * which were built adapter-shaped from the start.
 *
 * `allowDangerousEmailAccountLinking: true` on Google implements the spec's
 * explicit linking rule: "identities with the same *verified* email resolve
 * to the same User." The name is scary because it's usually unsafe with
 * providers that don't verify email — but Google's email is provider-
 * verified, which is exactly the documented case this flag exists for. The
 * email/magic-link provider needs no such flag: it has no separate identity
 * to reconcile, sign-in *is* an email lookup, so it always lands on the one
 * User row for that address.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { sendVerificationRequest } from "./lib/mailer";

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const FIFTEEN_MIN_S = 15 * 60;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "database",
    maxAge: THIRTY_DAYS_S,
    updateAge: 24 * 60 * 60, // rolling: refresh once per day of activity
  },
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
    Nodemailer({
      // Never actually connected to: sendVerificationRequest is fully
      // overridden below (mailer.ts owns the real SMTP-vs-console-log
      // decision). Auth.js just requires `server` to be present at
      // construction time.
      server: process.env.EMAIL_SERVER ?? "smtp://unused:unused@localhost:1025",
      from: process.env.EMAIL_FROM ?? "BotMarket <noreply@botmarket.app>",
      maxAge: FIFTEEN_MIN_S, // link expiry per spec; single-use is adapter-default
      sendVerificationRequest,
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, user }) {
      // Database strategy: `user` is the full adapter row, including our
      // schema's extra columns beyond the Auth.js core shape.
      session.user.id = user.id;
      session.user.role = (user as typeof user & { role: "customer" | "admin" }).role;
      session.user.ageAttestedAt = (
        user as typeof user & { ageAttestedAt: Date | null }
      ).ageAttestedAt;
      return session;
    },
  },
});
