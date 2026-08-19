import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({ url: 'file:/Users/vishnuvardhan/Desktop/image-feed/dev.db' });
const prisma = new PrismaClient({ adapter });

const DEV_EMAIL = "dev@atlas.local";
const NEW_PASSWORD = "Aaradhya@21424";

// Import the password hashing from the project's own implementation
async function hashPbkdf2(password: string): Promise<string> {
  const KDF_ITERATIONS = 47000;
  
  function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += (bytes[i] & 0xff).toString(16).padStart(2, "0");
    return out;
  }

  async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const enc = new TextEncoder().encode(password.normalize("NFKC"));
    const keyMaterial = await crypto.subtle.importKey("raw", enc.buffer as ArrayBuffer, "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: salt.buffer as ArrayBuffer,
        iterations,
      },
      keyMaterial,
      256,
    );
    return new Uint8Array(bits);
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt, KDF_ITERATIONS);
  return `pbkdf2$${KDF_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`;
}

(async () => {
  // First, get the user to ensure they exist
  const user = await prisma.user.findUnique({ 
    where: { email: DEV_EMAIL }, 
    include: { accounts: true } 
  });
  
  if (!user) {
    console.error(`User ${DEV_EMAIL} not found`);
    await prisma.$disconnect();
    return;
  }

  // Find the account for this user
  const account = user.accounts.find(a => a.providerId === "credential");
  
  if (!account) {
    console.error(`No credential account found for user ${DEV_EMAIL}`);
    await prisma.$disconnect();
    return;
  }

  // Hash the new password
  const passwordHash = await hashPbkdf2(NEW_PASSWORD);

  // Update the account's password
  await prisma.account.update({
    where: { id: account.id },
    data: { password: passwordHash },
  });

  console.log(`Updated password for ${DEV_EMAIL}`);
  console.log(`New password: ${NEW_PASSWORD}`);

  await prisma.$disconnect();
})();
