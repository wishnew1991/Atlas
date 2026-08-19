import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const filePath = databaseUrl.replace("file:", "");
const absolutePath = filePath.startsWith("/") ? filePath : process.cwd() + "/" + filePath;

const adapter = new PrismaBetterSqlite3({ url: `file:${absolutePath}` });
const prisma = new PrismaClient({ adapter });

const DEV_EMAIL = "dev@atlas.local";
const DEV_PASSWORD = "Aaradhya@21424";
const DEV_NAME = "Dev User";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (existing) {
    console.log(`Account already exists: ${DEV_EMAIL} (id: ${existing.id})`);
    await prisma.$disconnect();
    return;
  }

  const auth = betterAuth({
    database: prismaAdapter(prisma, { provider: "sqlite" }),
    emailAndPassword: { enabled: true, autoSignIn: false },
    socialProviders: {},
  });

  const result = await auth.api.signUpEmail({
    body: { name: DEV_NAME, email: DEV_EMAIL, password: DEV_PASSWORD },
  });

  console.log(`Created account: ${DEV_EMAIL}`);
  console.log(`USER_ID=${result.user.id}`);
  console.log(`Password: ${DEV_PASSWORD}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
