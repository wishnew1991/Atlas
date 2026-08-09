import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/atlas/server/prisma";
import { serverPassword } from "@/lib/atlas/server-password";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  secret: process.env.BETTER_AUTH_SECRET || "preview-secret-replace-me",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS 
    ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map(o=>o.trim()) 
    : ["https://atlas-9um.pages.dev", "https://admin.atlas-9um.pages.dev", "http://localhost:3000", "http://localhost:8788"],
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
