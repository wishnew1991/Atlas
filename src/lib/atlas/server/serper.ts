import "server-only";

import { readSerperApiKey } from "@/lib/atlas/server/model-registry";

const SERPER_ENDPOINT = "https://google.serper.dev/search";

export interface SerperResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SerperSearchResponse {
  results: SerperResult[];
  message?: string;
}

/**
 * Run a Google search through Serper (https://serper.dev). The API key is read
 * from the database setting `serperApiKey` (configured in the admin Search tab)
 * or falls back to the SERPER_API_KEY env var.
 */
export async function serperSearch(query: string): Promise<SerperSearchResponse> {
  const apiKey = (await readSerperApiKey()) || process.env.SERPER_API_KEY || "";

  if (!apiKey) {
    return { results: [], message: "Serper API key is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SERPER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query,
        gl: "in",
        hl: "en",
        num: 8,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 401) {
      return {
        results: [],
        message: "Serper rejected the API key. Check the key in Admin → Search.",
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        results: [],
        message: `Serper returned ${response.status}${text ? `: ${text}` : ""}`,
      };
    }

    const payload: unknown = await response.json();

    if (typeof payload !== "object" || payload === null) {
      return { results: [] };
    }

    const record = payload as Record<string, unknown>;
    const organic = Array.isArray(record.organic) ? record.organic : [];
    const knowledge = isRecord(record.knowledgeGraph) ? record.knowledgeGraph : null;

    const results: SerperResult[] = organic
      .filter(isRecord)
      .map((item) => ({
        title: typeof item.title === "string" ? item.title : "",
        link: typeof item.link === "string" ? item.link : "",
        snippet: typeof item.snippet === "string" ? item.snippet : "",
      }))
      .filter((item) => item.title || item.snippet);

    // Prepend a knowledge-graph answer when present.
    if (knowledge && typeof knowledge.title === "string" && knowledge.title) {
      results.unshift({
        title: `Knowledge: ${knowledge.title}`,
        link: "",
        snippet:
          typeof knowledge.description === "string"
            ? knowledge.description
            : typeof knowledge.descriptionSource === "string"
              ? knowledge.descriptionSource
              : "",
      });
    }

    return { results };
  } catch {
    return { results: [], message: "Could not reach Serper." };
  } finally {
    clearTimeout(timeout);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Format Serper results into a short, readable text block for the LLM. */
export function formatSerperResults(response: SerperSearchResponse): string {
  if (response.results.length === 0) {
    return response.message || "No search results were returned.";
  }

  const lines = response.results.map((result, index) => {
    const source = result.link ? ` (${result.link})` : "";
    return `${index + 1}. ${result.title}${source}\n   ${result.snippet}`;
  });

  return lines.join("\n\n");
}
