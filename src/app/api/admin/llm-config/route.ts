import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/atlas/server/prisma";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { decryptSecret } from "@/lib/security/secrets";

// Internal endpoint: returns the active LLM configuration for MCP servers /
// the local Browser Use launcher script. Admin-authorized — the previous
// localhost Host-header check was spoofable by any client.
export async function GET(_request: NextRequest) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  // Try the default model first (set in admin → Models tab)
  const defaultModel = await prisma.modelConfig.findFirst({
    where: { isDefault: true },
    include: { credential: true },
  });

  // Fallback: any available model
  const model = defaultModel ?? await prisma.modelConfig.findFirst({
    include: { credential: true },
  });

  if (!model?.credential) {
    return NextResponse.json({ error: "No model configured. Add one in /admin → Providers." }, { status: 404 });
  }

  const cred = model.credential;

  const baseUrls: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    nvidia: "https://integrate.api.nvidia.com/v1",
  };

  return NextResponse.json({
    api_key: decryptSecret(cred.apiKey),
    base_url: baseUrls[cred.provider] ?? cred.baseUrl ?? "https://api.openai.com/v1",
    model: model.id,
    provider: cred.provider,
  });
}
