import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/atlas/server/prisma";
import { serverPassword } from "@/lib/atlas/server-password";

const isPostgres = process.env.DATABASE_URL?.startsWith("postgres");

function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production (was previously falling back to a hardcoded dev secret)."
    );
  }
  return "dev-only-insecure-secret-do-not-use-in-production";
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: isPostgres ? "postgresql" : "sqlite",
  }),
  secret: resolveSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:3000", "http://localhost:3001"],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: serverPassword.hash,
      verify: async (data: { hash: string; password: string }) =>
        serverPassword.verify(data.hash, data.password),
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          },
        }
      : {}),
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
  },
  user: {
    changeEmail: { enabled: true },
  },
});
