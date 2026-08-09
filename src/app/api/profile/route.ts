import { NextResponse } from "next/server";

import {
  addProfileMemory,
  deleteProfileMemory,
  getProfileSnapshot,
  newId,
  updateProfile,
  type ProfileAddress,
  type ProfilePayment,
  type ProfilePrivacy,
} from "@/lib/atlas/profile/service";
import { AtlasAuthenticationError, getAtlasActor } from "@/lib/atlas/server/auth";
import type { MemoryType } from "@/lib/atlas/memory/service";


export const runtime = "edge";
export const dynamic = "force-dynamic";


function profileUserId(actorUserId: string) {
  return actorUserId || "atlas-demo-user";
}

/** GET /api/profile — identity, payments, privacy, memories. */
export async function GET() {
  try {
    const actor = await getAtlasActor();
    const profile = await getProfileSnapshot(profileUserId(actor.userId));
    return NextResponse.json({ profile }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}

/** PATCH /api/profile — update identity / addresses / payments / privacy, or memory ops. */
export async function PATCH(request: Request) {
  try {
    const actor = await getAtlasActor();
    const userId = profileUserId(actor.userId);
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const op = typeof payload.op === "string" ? payload.op : "update";

    if (op === "add_memory") {
      const text = typeof payload.text === "string" ? payload.text : "";
      const type = (typeof payload.type === "string" ? payload.type : "preference") as MemoryType;
      await addProfileMemory(userId, text, type);
      const profile = await getProfileSnapshot(userId);
      return NextResponse.json({ profile });
    }

    if (op === "delete_memory") {
      const memoryId = typeof payload.memoryId === "string" ? payload.memoryId : "";
      if (!memoryId) return NextResponse.json({ error: "memoryId required." }, { status: 400 });
      await deleteProfileMemory(userId, memoryId);
      const profile = await getProfileSnapshot(userId);
      return NextResponse.json({ profile });
    }

    if (op === "add_address") {
      const current = await getProfileSnapshot(userId);
      const label = typeof payload.label === "string" ? payload.label.trim() : "Home";
      const line = typeof payload.line === "string" ? payload.line.trim() : "";
      if (!line) return NextResponse.json({ error: "Address line required." }, { status: 400 });
      const addresses: ProfileAddress[] = [
        ...current.addresses,
        { id: newId(), label: label || "Home", line },
      ];
      const profile = await updateProfile(userId, { addresses });
      return NextResponse.json({ profile });
    }

    if (op === "delete_address") {
      const addressId = typeof payload.addressId === "string" ? payload.addressId : "";
      const current = await getProfileSnapshot(userId);
      const profile = await updateProfile(userId, {
        addresses: current.addresses.filter((a) => a.id !== addressId),
      });
      return NextResponse.json({ profile });
    }

    if (op === "add_payment") {
      const kind = payload.kind === "card" ? "card" : "upi";
      const label = typeof payload.label === "string" ? payload.label.trim() : kind === "upi" ? "UPI" : "Card";
      const value = typeof payload.value === "string" ? payload.value.trim() : "";
      if (!value) return NextResponse.json({ error: "Payment value required." }, { status: 400 });
      if (kind === "upi" && !value.includes("@")) {
        return NextResponse.json({ error: "Enter a UPI ID like name@bank." }, { status: 400 });
      }
      const current = await getProfileSnapshot(userId);
      const payments: ProfilePayment[] = [
        ...current.payments,
        { id: newId(), kind, label: label || (kind === "upi" ? "UPI" : "Card"), value },
      ];
      const profile = await updateProfile(userId, { payments });
      return NextResponse.json({ profile });
    }

    if (op === "delete_payment") {
      const paymentId = typeof payload.paymentId === "string" ? payload.paymentId : "";
      const current = await getProfileSnapshot(userId);
      const profile = await updateProfile(userId, {
        payments: current.payments.filter((p) => p.id !== paymentId),
      });
      return NextResponse.json({ profile });
    }

    const privacyPatch: Partial<ProfilePrivacy> = {};
    if (typeof payload.privacy === "object" && payload.privacy !== null) {
      const p = payload.privacy as Record<string, unknown>;
      if (typeof p.saveMemory === "boolean") privacyPatch.saveMemory = p.saveMemory;
      if (typeof p.useLocation === "boolean") privacyPatch.useLocation = p.useLocation;
      if (typeof p.shareAnalytics === "boolean") privacyPatch.shareAnalytics = p.shareAnalytics;
    }

    const profile = await updateProfile(userId, {
      ...(typeof payload.name === "string" ? { name: payload.name } : {}),
      ...(typeof payload.phone === "string" ? { phone: payload.phone } : {}),
      ...(typeof payload.email === "string" ? { email: payload.email } : {}),
      ...(Object.keys(privacyPatch).length > 0 ? { privacy: privacyPatch } : {}),
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AtlasAuthenticationError) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Could not update profile.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
