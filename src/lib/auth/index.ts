import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/atlas/server/prisma";
import { serverPassword } from "@/lib/atlas/server-password";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  secret: process.env.BETTER_AUTH_SECRET || "preview-secret-replace-me",
  baseURL: process.env.BETTER_AUTH_URL || "https://preview.atlas-9um.pages.dev",
  // Trust all preview origins dynamically. In production, set BETTER_AUTH_TRUSTED_ORIGINS env var.
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map(o=>o.trim()) : ["*"],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: serverPassword.hash,
      verify: async (data: { hash: string; password: string }) =>
        serverPassword.verify(data.hash, data.password),
    },
  },
  socialProviders: {},
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
