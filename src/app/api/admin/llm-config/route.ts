import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/atlas/server/prisma";


// Internal endpoint: returns the active LLM configuration for MCP servers.
// Only accessible from localhost — used by Browser Use launcher script.
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("::1");

  if (!isLocal) {
    return NextResponse.json({ error: "Internal use only" }, { status: 403 });
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
    api_key: cred.apiKey,
    base_url: baseUrls[cred.provider] ?? cred.baseUrl ?? "https://api.openai.com/v1",
    model: model.id,
    provider: cred.provider,
  });
}
