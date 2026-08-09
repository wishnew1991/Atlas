import "server-only";

// `node:crypto` is not statically imported here on purpose: Next.js' build-time
// edge sandbox resolves the module at import time, where nodejs_compat hasn't
// been wired yet. We lazy-`require` it only when a function actually runs (the
// Cloudflare Worker ships nodejs_compat, so the same code works on-dev and up).

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

type NodeCrypto = typeof import("node:crypto");

let cryptoModule: NodeCrypto | null = null;

function nodeCrypto(): NodeCrypto {
  if (!cryptoModule) {
    cryptoModule = require("node:crypto") as NodeCrypto;
  }
  return cryptoModule;
}

function getSecretKey(): Buffer | null {
  const raw = process.env.ATLAS_SECRET_KEY;
  if (!raw) return null;
  try {
    return Buffer.from(raw, "base64");
  } catch {
    return null;
  }
}

/** Returns true when a value was stored encrypted (rather than passthrough). */
export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

function warnMissingKey(target: string): void {
  if (process.env.ATLAS_SUPPRESS_SECRET_KEY_WARNING !== "true") {
    // eslint-disable-next-line no-console
    console.warn(
      `[secrets] ATLAS_SECRET_KEY is not set — storing ${target} in plaintext. Set it in production.`
    );
  }
}

/**
 * AES-256-GCM encrypt. Returns `enc:v1:<base64 iv>:<base64 tag>:<base64 ct>`.
 * Falls back to plaintext (with a warning) when no key is configured so that
 * existing dev databases keep working; production must set ATLAS_SECRET_KEY.
 */
export function encryptSecret(plaintext: string, target = "secret"): string {
  if (!plaintext) return plaintext;

  const key = getSecretKey();
  if (!key) {
    warnMissingKey(target);
    return plaintext;
  }

  const { randomBytes, createCipheriv } = nodeCrypto();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key as never, iv as never);
  const encrypted = Buffer.concat(
    [cipher.update(plaintext, "utf8") as unknown as Buffer, cipher.final() as unknown as Buffer] as never[]
  );
  const tag = cipher.getAuthTag() as unknown as Buffer;

  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Plaintext and legacy values pass through. */
export function decryptSecret(ciphertext: string | null | undefined): string {
  if (!ciphertext) return ciphertext ?? "";
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;

  const key = getSecretKey();
  if (!key) return ciphertext;

  const body = ciphertext.slice(PREFIX.length);
  const parts = body.split(":");
  if (parts.length !== 3) return ciphertext;

  const [ivB64, tagB64, dataB64] = parts;
  try {
    const { createDecipheriv } = nodeCrypto();
    const decipher = createDecipheriv(ALGORITHM, key as never, Buffer.from(ivB64, "base64") as never);
    decipher.setAuthTag(Buffer.from(tagB64, "base64") as never);
    const decrypted = Buffer.concat(
      [
        decipher.update(Buffer.from(dataB64, "base64") as never) as unknown as Buffer,
        decipher.final() as unknown as Buffer,
      ] as never[]
    );
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}