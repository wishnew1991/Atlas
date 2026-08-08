import { NextResponse } from "next/server";

import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";
import { decryptSecret } from "@/lib/security/secrets";

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

const fallbackProviderModels: Record<string, string[]> = {
  google: [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-pro",
    "gemini-flash-latest",
    "text-embedding-004",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "o3-mini",
    "text-embedding-3-small",
  ],
  anthropic: [
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
  ],
  nvidia: [
    "nvidia/llama-3.3-nemotron-super-49b-v1",
    "nvidia/llama-3.1-nemotron-nano-8b-v1",
  ],
};

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!isRecord(payload)) {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const provider = payload.provider;
  let apiKey = typeof payload.apiKey === "string" ? payload.apiKey : "";
  const credentialId = typeof payload.credentialId === "string" ? payload.credentialId : undefined;
  const baseUrl = typeof payload.baseUrl === "string" ? payload.baseUrl : undefined;

  if (typeof provider !== "string") {
    return NextResponse.json({ error: "provider is required." }, { status: 400 });
  }

  // If apiKey is missing or masked, resolve it from the saved credential in DB
  if (!apiKey || apiKey.includes("…") || apiKey.includes("••••") || apiKey.includes("...")) {
    if (credentialId) {
      const saved = await prisma.credential.findUnique({ where: { id: credentialId } });
      if (saved?.apiKey) {
        apiKey = decryptSecret(saved.apiKey);
      }
    } else {
      const saved = await prisma.credential.findFirst({
        where: { provider: provider as any },
        orderBy: { createdAt: "desc" },
      });
      if (saved?.apiKey) {
        apiKey = decryptSecret(saved.apiKey);
      }
    }
  }

  if (!apiKey || apiKey.includes("…") || apiKey.includes("••••") || apiKey.includes("...")) {
    return NextResponse.json({ error: "A valid API key is required." }, { status: 400 });
  }

  const resolvedBase = normalizeBaseUrl(baseUrl || defaultBaseUrls[provider] || "");

  if (!resolvedBase) {
    return NextResponse.json({ models: fallbackProviderModels[provider] || [], note: "Provider has no discoverable model list." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    // Google supports API key via query param and x-goog-api-key header
    const isGoogle = provider === "google";
    const fetchUrl = isGoogle
      ? `${resolvedBase}/models?key=${encodeURIComponent(apiKey)}`
      : `${resolvedBase}/models`;

    const headers: Record<string, string> = isGoogle
      ? { "x-goog-api-key": apiKey }
      : { Authorization: `Bearer ${apiKey}` };

    const response = await fetch(fetchUrl, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const fallbackList = fallbackProviderModels[provider] || [];
      return NextResponse.json(
        {
          models: fallbackList,
          note: `Model discovery (${response.status}) was restricted by provider policy. Standard models have been loaded for selection.`,
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
        : isRecord(data) && Array.isArray(data.models)
          ? (data.models as unknown[])
              .filter(isRecord)
              .map((entry) => {
                const name = typeof entry.name === "string" ? entry.name : "";
                // Google returns "models/gemini-2.5-flash" — strip prefix
                return name.replace(/^models\//, "");
              })
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
