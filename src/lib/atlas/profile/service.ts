import "server-only";



import { prisma } from "@/lib/atlas/server/prisma";
import { memoryService, type MemoryType } from "@/lib/atlas/memory/service";

export type ProfileAddress = {
  id: string;
  label: string;
  line: string;
};

export type ProfilePayment = {
  id: string;
  kind: "upi" | "card";
  label: string;
  /** UPI VPA (e.g. name@okaxis) or masked card (e.g. Visa ···· 4242). */
  value: string;
};

export type ProfilePrivacy = {
  saveMemory: boolean;
  useLocation: boolean;
  shareAnalytics: boolean;
};

export type ProfileSnapshot = {
  userId: string;
  name: string;
  phone: string;
  email: string;
  addresses: ProfileAddress[];
  payments: ProfilePayment[];
  privacy: ProfilePrivacy;
  memories: Array<{
    id: string;
    type: string;
    text: string;
    updatedAt: string;
  }>;
};

const DEFAULT_PRIVACY: ProfilePrivacy = {
  saveMemory: true,
  useLocation: true,
  shareAnalytics: false,
};

function parseJsonArray<T>(raw: string): T[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parsePrivacy(raw: string): ProfilePrivacy {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_PRIVACY };
    const obj = parsed as Record<string, unknown>;
    return {
      saveMemory: typeof obj.saveMemory === "boolean" ? obj.saveMemory : DEFAULT_PRIVACY.saveMemory,
      useLocation: typeof obj.useLocation === "boolean" ? obj.useLocation : DEFAULT_PRIVACY.useLocation,
      shareAnalytics:
        typeof obj.shareAnalytics === "boolean" ? obj.shareAnalytics : DEFAULT_PRIVACY.shareAnalytics,
    };
  } catch {
    return { ...DEFAULT_PRIVACY };
  }
}

type AuthIdentity = {
  name: string;
  email: string;
  phone: string;
};

/**
 * Pull name / email from the signed-in account (better-auth User table).
 * The profile service receives the auth user id, so we can read the
 * identity directly without a session round-trip.
 */
async function identityFromAuth(userId: string): Promise<AuthIdentity | null> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    return { name: user.name ?? "", email: user.email ?? "", phone: "" };
  } catch {
    return null;
  }
}

async function ensureProfile(userId: string) {
  const existing = await prisma.userProfile.findUnique({ where: { userId } });
  const fromAuth = await identityFromAuth(userId);

  if (existing) {
    // Fill blanks from sign-up/account once; never overwrite user edits.
    const data: { name?: string; email?: string; phone?: string } = {};
    if (!existing.name.trim() && fromAuth?.name) data.name = fromAuth.name;
    if (!existing.email.trim() && fromAuth?.email) data.email = fromAuth.email;
    if (!existing.phone.trim() && fromAuth?.phone) data.phone = fromAuth.phone;
    if (Object.keys(data).length === 0) return existing;
    return prisma.userProfile.update({ where: { userId }, data });
  }

  return prisma.userProfile.create({
    data: {
      userId,
      name: fromAuth?.name || "",
      email: fromAuth?.email || "",
      phone: fromAuth?.phone || "",
      privacyJson: JSON.stringify(DEFAULT_PRIVACY),
    },
  });
}

export async function getProfileSnapshot(userId: string): Promise<ProfileSnapshot> {
  const row = await ensureProfile(userId);
  const memories = await prisma.memory.findMany({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return {
    userId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    addresses: parseJsonArray<ProfileAddress>(row.addressesJson),
    payments: parseJsonArray<ProfilePayment>(row.paymentsJson),
    privacy: parsePrivacy(row.privacyJson),
    memories: memories.map((m) => ({
      id: m.id,
      type: m.type,
      text: m.text,
      updatedAt: m.updatedAt.toISOString(),
    })),
  };
}

export type ProfilePatch = {
  name?: string;
  phone?: string;
  email?: string;
  addresses?: ProfileAddress[];
  payments?: ProfilePayment[];
  privacy?: Partial<ProfilePrivacy>;
};

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileSnapshot> {
  const row = await ensureProfile(userId);
  const privacy = { ...parsePrivacy(row.privacyJson), ...(patch.privacy ?? {}) };

  await prisma.userProfile.update({
    where: { userId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone.trim() } : {}),
      ...(patch.email !== undefined ? { email: patch.email.trim() } : {}),
      ...(patch.addresses !== undefined ? { addressesJson: JSON.stringify(patch.addresses) } : {}),
      ...(patch.payments !== undefined ? { paymentsJson: JSON.stringify(patch.payments) } : {}),
      ...(patch.privacy !== undefined ? { privacyJson: JSON.stringify(privacy) } : {}),
    },
  });

  return getProfileSnapshot(userId);
}


export async function addProfileMemory(
  userId: string,
  text: string,
  type: MemoryType = "preference"
) {
  const clean = text.trim();
  if (!clean) throw new Error("Memory text required.");
  return memoryService.remember(userId, clean, { type, kind: "user" });
}

export async function deleteProfileMemory(userId: string, memoryId: string) {
  await memoryService.forget(userId, memoryId);
}

export function newId() {
  return globalThis.crypto.randomUUID();
}
