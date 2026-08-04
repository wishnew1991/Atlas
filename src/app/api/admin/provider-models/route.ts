import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const defaultBaseUrls: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
  anthropic: "https://api.anthropic.com/v1",
};

/**
 * Normalize a provider base URL: strip trailing slashes and any path
 * beyond the version segment (e.g. "/models" or "/audio/transcriptions").
 * The caller will append "/models" to fetch the model list.
 */
function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  // Strip a trailing "/models" so the caller can append it cleanly.
  return trimmed.replace(/\/models$/, "");
}

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  const payload: unknown = await request.json();

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const provider = payload.provider;
  const apiKey = payload.apiKey;
  const baseUrl = typeof payload.baseUrl === "string" ? payload.baseUrl : undefined;

  if (typeof provider !== "string" || typeof apiKey !== "string") {
    return NextResponse.json({ error: "provider and apiKey are required." }, { status: 400 });
  }

  const resolvedBase = normalizeBaseUrl(baseUrl || defaultBaseUrls[provider] || "");

  if (!resolvedBase) {
    return NextResponse.json({ models: [], note: "Provider has no discoverable model list." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${resolvedBase}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          models: [],
          error: `Provider returned ${response.status} for ${resolvedBase}/models. Check the base URL and API key. Enter the model ID manually.`,
        },
        { status: 200 }
      );
    }

    const data: unknown = await response.json();
    const rawIds: string[] =
      isRecord(data) && Array.isArray(data.data)
        ? (data.data as unknown[])
            .filter(isRecord)
            .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
            .filter(Boolean)
        : [];

    const models = Array.from(new Set(rawIds)).sort();

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json(
      { models: [], error: `Could not reach ${resolvedBase}/models. Check the base URL and API key. Enter the model ID manually.` },
      { status: 200 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
