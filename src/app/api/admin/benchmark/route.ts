import { NextResponse } from "next/server";
import { requireAtlasAdmin } from "@/lib/atlas/server/auth";
import { prisma } from "@/lib/atlas/server/prisma";
import { decryptSecret } from "@/lib/security/secrets";
import { chat } from "@/lib/atlas/llm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAtlasAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  try {
    const { prompt, modelIds } = await request.json();
    if (!prompt || !Array.isArray(modelIds) || modelIds.length === 0) {
      return NextResponse.json({ error: "prompt and modelIds array are required." }, { status: 400 });
    }

    // Resolve models and their provider credentials from DB
    const dbModels = await prisma.modelConfig.findMany({
      where: { id: { in: modelIds } },
      include: { credential: true }
    });

    const results = await Promise.all(
      dbModels.map(async (model) => {
        const start = Date.now();
        let output = "";
        let error = null;

        try {
          const decryptedApiKey = decryptSecret(model.credential.apiKey);
          const response = await chat({
            provider: model.credential.provider as any,
            apiKey: decryptedApiKey,
            baseUrl: model.credential.baseUrl ?? undefined,
            model: model.id,
            messages: [{ role: "user", content: prompt }]
          });
          output = response.content || "";
        } catch (err: any) {
          error = err.message || "Failed execution";
        }

        const duration = Date.now() - start;
        return {
          modelId: model.id,
          label: model.label,
          provider: model.credential.provider,
          latencyMs: duration,
          length: output.length,
          output: output ? output.substring(0, 120) + (output.length > 120 ? "..." : "") : "",
          error,
          success: !error
        };
      })
    );

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Benchmark failed." }, { status: 500 });
  }
}
