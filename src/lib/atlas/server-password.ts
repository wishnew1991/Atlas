import "server-only";

import { scryptAsync } from "@noble/hashes/scrypt.js";

// better-auth defaults to a pure-JS scrypt (N=16384, r=16) via @noble/hashes.
// On Cloudflare Workers free tier (10 ms CPU per request) that consistently
// exceeds the budget during sign-in/sign-up. PBKDF2-SHA256 through the native
// Web Crypto API is dramatically cheaper on CPU while remaining a sensible
// password KDF at our iteration count.
//
// New hashes are stored self-describing:
//   pbkdf2$<iterations>$<saltHex>$<keyHex>
// Legacy better-auth scrypt hashes (salt:key) are still verified so existing
// accounts keep working; verifying one simply costs scrypt once.

const KDF_ITERATIONS = 47000;

export interface PasswordHashing {
  hash: (password: string) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += (bytes[i] & 0xff).toString(16).padStart(2, "0");
  return out;
}

function hexToBytes(hexStr: string): Uint8Array {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexStr.substr(i * 2, 2), 16);
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

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hashPbkdf2(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(password, salt, KDF_ITERATIONS);
  return `pbkdf2$${KDF_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(key)}`;
}

async function verifyPbkdf2(stored: string, password: string): Promise<boolean> {
  const [tag, iterStr, saltHex, hashHex] = stored.split("$");
  if (tag !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
  const iterations = Number(iterStr);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = hexToBytes(saltHex);
    expected = hexToBytes(hashHex);
  } catch {
    return false;
  }
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function verifyLegacyScrypt(stored: string, password: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;
  // better-auth's default passes the salt to scrypt as the hex string itself
  // (TextEncoder → UTF-8 bytes of the 32-char hex), so we must replicate that
  // exactly rather than decoding to raw bytes.
  const target = await scryptAsync(password.normalize("NFKC"), saltHex, {
    N: 16384,
    r: 16,
    p: 1,
    dkLen: 64,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return bytesToHex(target) === keyHex;
}

export const serverPassword: PasswordHashing = {
  hash: hashPbkdf2,
  verify: async (stored, password) => {
    if (stored.startsWith("pbkdf2$")) return verifyPbkdf2(stored, password);
    return verifyLegacyScrypt(stored, password);
  },
};