import "server-only";

import { prisma } from "@/lib/atlas/server/prisma";
import { resolveEmbeddingModel } from "@/lib/atlas/server/model-registry";
import { embed } from "@/lib/atlas/llm";
import { toLlmProvider } from "@/lib/atlas/server/provider-map";

/** High-level split: personal memory vs external knowledge. */
export type MemoryKind = "user" | "knowledge";

/**
 * Memory type taxonomy. The LLM classifies each extracted memory into one of
 * these during extraction. Adding new types is a one-line change here and
 * requires no alteration of the core storage or retrieval interfaces.
 */
export type MemoryType =
  | "identity"
  | "preference"
  | "relationship"
  | "goal"
  | "project"
  | "habit"
  | "health"
  | "travel"
  | "food"
  | "work"
  | "finance"
  | "event"
  | "instruction"
  | "knowledge";

export const MEMORY_TYPES: MemoryType[] = [
  "identity",
  "preference",
  "relationship",
  "goal",
  "project",
  "habit",
  "health",
  "travel",
  "food",
  "work",
  "finance",
  "event",
  "instruction",
  "knowledge",
];

export type MemoryStatus = "active" | "archived";

export interface MemoryRecord {
  id: string;
  kind: MemoryKind;
  type: MemoryType;
  text: string;
  confidence: number;
  importance: number;
  status: MemoryStatus;
  accessCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
}

export interface RetrievedMemory extends MemoryRecord {
  /** Similarity score (0..1) used for this retrieval. */
  score: number;
  /** Optional human-readable reason this memory was surfaced (explainability). */
  reason?: string;
}

export interface RememberOptions {
  kind?: MemoryKind;
  type?: MemoryType;
  importance?: number;
  confidence?: number;
  /** If set, the memory auto-expires after this many hours (temporary memory). */
  expiresInHours?: number;
}

// ---------------------------------------------------------------------------
// Knowledge Graph layer
// ---------------------------------------------------------------------------

/** Operations the reasoning layer can apply to a memory/relationship. */
export type MemoryOperation =
  | "create"
  | "replace"
  | "append"
  | "remove"
  | "strengthen"
  | "weaken"
  | "archive";

export interface GraphEntity {
  id: string;
  name: string;
  kind: string;
}

export interface GraphRelation {
  id: string;
  relation: string;
  strength: number;
  status: MemoryStatus;
  subject: GraphEntity;
  object: GraphEntity;
}

export interface GraphTriple {
  subject: string;
  relation: string;
  object: string;
  /** Optional entity types for reasoning, e.g. subject "user", object "hotel". */
  subjectKind?: string;
  objectKind?: string;
}

/**
 * Maps a request category to the graph relationships that are relevant, so the
 * reasoning layer can query structured facts directly instead of relying on
 * vector similarity. Future relationship types extend this map without touching
 * storage or the Memory Service interface.
 */
export const RELATIONS_BY_CATEGORY: Record<string, string[]> = {
  travel: ["prefers", "travels_to", "traveled_to", "travels_with", "no_longer_prefers", "budget"],
  food: ["likes", "dislikes", "allergic_to", "diet", "eats_at", "no_longer_likes"],
  work: ["works_at", "manages", "collaborates_with", "projects"],
  relationship: ["related_to", "family_of", "partner_of"],
  finance: ["earns", "invests_in", "spends_on"],
  health: ["has_condition", "takes_medication", "exercises"],
  default: ["prefers", "likes", "works_at", "travels_to", "related_to"],
};

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function decodeVector(value: string): number[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as unknown[]).filter((n) => typeof n === "number") as number[] : [];
  } catch {
    return [];
  }
}

function toRecord(row: {
  id: string;
  kind: string;
  type: string;
  text: string;
  confidence: number;
  importance: number;
  status: string;
  accessCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
}): MemoryRecord {
  return {
    id: row.id,
    kind: (row.kind as MemoryKind) ?? "user",
    type: (row.type as MemoryType) ?? "knowledge",
    text: row.text,
    confidence: row.confidence ?? 0.5,
    importance: row.importance ?? 0.5,
    status: (row.status as MemoryStatus) ?? "active",
    accessCount: row.accessCount ?? 0,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * Memory Orchestrator
 * -------------------
 * Decides WHICH memory categories are relevant for a request instead of relying
 * solely on raw vector similarity. It maps a request category to the memory
 * types that should be assembled, then retrieval blends that selection with
 * semantic similarity. Future categories (graph, habits, recommendations) can be
 * added here without touching storage.
 */
export const memoryOrchestrator = {
  /** Resolve a request domain/category into the memory types worth retrieving. */
  relevantTypes(category: string): MemoryType[] {
    const c = category.toLowerCase();

    if (/(travel|hotel|flight|trip|vacation)/.test(c)) {
      return ["travel", "preference", "event", "relationship", "identity"];
    }
    if (/(food|eat|restaurant|diet|meal|recipe|hungry|craving)/.test(c)) {
      return ["food", "health", "preference", "event"];
    }
    if (/(shop|buy|order|cart|purchase)/.test(c)) {
      return ["preference", "work", "finance", "identity"];
    }
    if (/(health|doctor|medication|exercise|sleep)/.test(c)) {
      return ["health", "habit", "preference", "event"];
    }
    if (/(work|job|project|meeting|deadline|email)/.test(c)) {
      return ["work", "project", "goal", "instruction", "relationship"];
    }
    if (/(money|finance|budget|invest|salary|expense)/.test(c)) {
      return ["finance", "preference", "goal"];
    }
    if (/(family|friend|wife|husband|partner|child|mom|dad)/.test(c)) {
      return ["relationship", "event", "preference", "identity"];
    }
    if (/(goal|plan|dream|resolution)/.test(c)) {
      return ["goal", "project", "habit"];
    }
    // Default: broad personal context.
    return ["identity", "preference", "goal", "instruction", "event"];
  },
};

/**
 * The Memory Service is the single entry point for all long-term memory
 * operations. No other component touches the vector store directly; everything
 * (store, embed, semantic search, lifecycle, consolidation) goes through here.
 */
export const memoryService = {
  /** True when an embedding model is configured and memory is operational. */
  async isAvailable(): Promise<boolean> {
    return Boolean(await resolveEmbeddingModel());
  },

  /** Create a new memory (with embedding + optional expiry). */
  async remember(userId: string, text: string, opts: RememberOptions = {}): Promise<MemoryRecord | null> {
    const model = await resolveEmbeddingModel();
    if (!model) return null; // No embedding model → memory disabled.

    const mapped = toLlmProvider(model.provider);
    const { embeddings } = await embed({
      model: model.id,
      input: text,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl || mapped.baseUrl,
      provider: mapped.provider,
    });

    const vector = embeddings[0];
    if (!vector) return null;

    const expiresAt = opts.expiresInHours ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000) : null;

    const row = await prisma.memory.create({
      data: {
        userId,
        kind: opts.kind ?? "user",
        type: opts.type ?? "knowledge",
        text,
        embedding: JSON.stringify(vector),
        importance: opts.importance ?? 0.5,
        confidence: opts.confidence ?? 0.6,
        expiresAt,
      },
    });

    return toRecord(row);
  },

  /**
   * Update an existing memory in place (lifecycle: update). Bumps confidence and
   * refreshes the timestamp so repeated/confirmed facts strengthen over time.
   */
  async update(id: string, patch: { text?: string; confidence?: number; importance?: number; type?: MemoryType; status?: MemoryStatus }): Promise<void> {
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.text !== undefined) data.text = patch.text;
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.importance !== undefined) data.importance = patch.importance;
    if (patch.confidence !== undefined) {
      data.confidence = Math.max(0, Math.min(1, patch.confidence));
    }
    await prisma.memory.updateMany({ where: { id }, data });
  },

  /** Merge `sourceId` into `targetId` (lifecycle: merge). Target absorbs confidence/importance. */
  async merge(sourceId: string, targetId: string): Promise<void> {
    const [source, target] = await Promise.all([
      prisma.memory.findUnique({ where: { id: sourceId } }),
      prisma.memory.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) return;

    const confidence = Math.max(source.confidence, target.confidence);
    const importance = Math.max(source.importance, target.importance);
    await prisma.memory.update({
      where: { id: targetId },
      data: {
        confidence,
        importance,
        accessCount: target.accessCount + source.accessCount,
        updatedAt: new Date(),
      },
    });
    await prisma.memory.deleteMany({ where: { id: sourceId } });
  },

  /** Archive instead of hard-delete when we want to retain history (lifecycle: archive). */
  async archive(id: string): Promise<void> {
    await this.update(id, { status: "archived" });
  },

  /** Hard delete (lifecycle: delete). */
  async forget(userId: string, id: string): Promise<void> {
    await prisma.memory.deleteMany({ where: { userId, id } });
  },

  /**
   * Store a user-visible memory without requiring an embedding model.
   * Used by Profile so people can add preferences even when semantic search is offline.
   */
  async rememberPlain(
    userId: string,
    text: string,
    opts: RememberOptions = {}
  ): Promise<MemoryRecord> {
    const expiresAt = opts.expiresInHours
      ? new Date(Date.now() + opts.expiresInHours * 3600 * 1000)
      : null;

    let embedding: string | null = null;
    try {
      const model = await resolveEmbeddingModel();
      if (model) {
        const mapped = toLlmProvider(model.provider);
        const { embeddings } = await embed({
          model: model.id,
          input: text,
          apiKey: model.apiKey,
          baseUrl: model.baseUrl || mapped.baseUrl,
          provider: mapped.provider,
        });
        if (embeddings[0]) embedding = JSON.stringify(embeddings[0]);
      }
    } catch {
      /* embeddings optional for profile-authored memories */
    }

    const row = await prisma.memory.create({
      data: {
        userId,
        kind: opts.kind ?? "user",
        type: opts.type ?? "preference",
        text,
        embedding,
        importance: opts.importance ?? 0.6,
        confidence: opts.confidence ?? 0.7,
        expiresAt,
      },
    });

    return toRecord(row);
  },

  /** List active personal memories for Profile UI. */
  async listForUser(userId: string, limit = 40): Promise<MemoryRecord[]> {
    const rows = await prisma.memory.findMany({
      where: {
        userId,
        kind: "user",
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return rows.map(toRecord);
  },

  /**
   * Orchestrated retrieval. Selects memories by the orchestrator's relevant
   * types for the category, then ranks them by a blend of semantic similarity,
   * confidence, importance, and access frequency. Expired/temporary memories and
   * archived memories are excluded. Returns enriched records (with reason).
   */
  async recall(
    userId: string,
    query: string,
    opts: { category?: string; types?: MemoryType[]; limit?: number; minScore?: number } = {}
  ): Promise<RetrievedMemory[]> {
    const model = await resolveEmbeddingModel();
    if (!model || !query.trim()) return [];

    const mapped = toLlmProvider(model.provider);
    const { embeddings } = await embed({
      model: model.id,
      input: query,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl || mapped.baseUrl,
      provider: mapped.provider,
    });

    const queryVector = embeddings[0];
    if (!queryVector) return [];

    const types = opts.types ?? memoryOrchestrator.relevantTypes(opts.category ?? query);
    const now = new Date();

    const rows = await prisma.memory.findMany({
      where: {
        userId,
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        type: { in: types },
      },
    });

    const scored = rows
      .map((row) => {
        const vector = decodeVector(row.embedding ?? "[]");
        const similarity = cosineSimilarity(queryVector, vector);
        const record = toRecord(row);
        // Blend: semantic similarity (0.6) + confidence (0.15) + importance (0.15)
        // + normalized access frequency (0.1). This makes well-established,
        // frequently used memories surface even at slightly lower similarity.
        const accessBoost = Math.min(1, record.accessCount / 10);
        const score =
          0.6 * similarity + 0.15 * (record.confidence ?? 0.5) + 0.15 * (record.importance ?? 0.5) + 0.1 * accessBoost;
        return {
          ...record,
          score,
          reason: `matched type "${record.type}" for category "${opts.category ?? "general"}"`,
        };
      })
      .filter((entry) => entry.score >= (opts.minScore ?? 0.0))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? 8);

    if (scored.length > 0) {
      // Touch lastUsedAt + bump accessCount so repeated use strengthens memory.
      await prisma.memory
        .updateMany({
          where: { id: { in: scored.map((entry) => entry.id) } },
          data: { lastUsedAt: new Date(), accessCount: { increment: 1 } },
        })
        .catch(() => {});
    }

    return scored;
  },

  /**
   * Background consolidation pass (lifecycle quality improvement).
   * - expires temporary memories past their TTL (soft-archive)
   * - merges near-duplicate active memories of the same type
   * - lowers confidence of contradicting pairs (handled at extraction time)
   * Safe to call periodically; it never blocks request paths.
   */
  async consolidate(userId: string): Promise<{ expired: number; merged: number }> {
    const now = new Date();
    const expired = await prisma.memory
      .updateMany({
        where: { userId, status: "active", expiresAt: { lt: now } },
        data: { status: "archived" },
      })
      .then((r) => r.count)
      .catch(() => 0);

    let merged = 0;
    const active = await prisma.memory.findMany({
      where: { userId, status: "active" },
      orderBy: { accessCount: "desc" },
    });

    const seen = new Map<string, (typeof active)[number]>();
    for (const row of active) {
      const key = `${row.userId}:${row.type}:${row.text.toLowerCase().trim()}`;
      const prior = seen.get(key);
      if (prior) {
        await this.merge(row.id, prior.id);
        merged += 1;
      } else {
        seen.set(key, row);
      }
    }

    return { expired, merged };
  },

  // ----- Knowledge Graph layer (structured reasoning, runs alongside vectors) -----

  /** Get-or-create a canonical entity node for a user. */
  async ensureEntity(userId: string, name: string, kind = "entity"): Promise<GraphEntity> {
    const row = await prisma.memoryEntity.upsert({
      where: { userId_name: { userId, name } },
      create: { userId, name, kind },
      update: { kind },
    });
    return { id: row.id, name: row.name, kind: row.kind };
  },

  /**
   * Record a structured relationship (triple). If an active relation already
   * exists for the same subject+relation+object, it is strengthened instead of
   * duplicated. Returns the resulting relation.
   */
  async addTriple(userId: string, triple: GraphTriple): Promise<GraphRelation> {
    const subject = await this.ensureEntity(userId, triple.subject, triple.subjectKind ?? "entity");
    const object = await this.ensureEntity(userId, triple.object, triple.objectKind ?? "entity");

    const existing = await prisma.memoryRelation.findFirst({
      where: { userId, subjectId: subject.id, objectId: object.id, relation: triple.relation, status: "active" },
      include: { subject: true, object: true },
    });

    if (existing) {
      const updated = await prisma.memoryRelation.update({
        where: { id: existing.id },
        data: { strength: Math.min(1, existing.strength + 0.2), status: "active", updatedAt: new Date() },
        include: { subject: true, object: true },
      });
      return relationToGraph(updated);
    }

    const created = await prisma.memoryRelation.create({
      data: { userId, subjectId: subject.id, objectId: object.id, relation: triple.relation, strength: 0.6 },
      include: { subject: true, object: true },
    });
    return relationToGraph(created);
  },

  /**
   * Query the relationship graph directly — independent of embedding similarity.
   * Filter by subject, relation type, or object. Returns active relations only.
   */
  async queryGraph(
    userId: string,
    opts: { subject?: string; relation?: string | string[]; object?: string; category?: string; limit?: number } = {}
  ): Promise<GraphRelation[]> {
    const relations = Array.isArray(opts.relation)
      ? opts.relation
      : opts.relation
        ? [opts.relation]
        : undefined;

    const categoryRelations = opts.category ? RELATIONS_BY_CATEGORY[opts.category] ?? RELATIONS_BY_CATEGORY.default : undefined;
    const relationFilter = relations ?? categoryRelations;

    const rows = await prisma.memoryRelation.findMany({
      where: {
        userId,
        status: "active",
        ...(relationFilter ? { relation: { in: relationFilter } } : {}),
        ...(opts.subject
          ? { subject: { name: opts.subject } }
          : {}),
        ...(opts.object ? { object: { name: opts.object } } : {}),
      },
      include: { subject: true, object: true },
      orderBy: { strength: "desc" },
      take: opts.limit ?? 20,
    });

    return rows.map(relationToGraph);
  },

  /**
   * Apply a memory operation to a relationship (conflict resolution / lifecycle).
   * - replace: archive any active relations with the same subject+relation that
   *   point to a *different* object, then add the new triple.
   * - remove / archive: mark matching active relations archived.
   * - strengthen / weaken: adjust strength.
   * - append: same as create (multiple relations of one type may coexist).
   * This is how "I prefer Hyatt over Marriott" archives the old preference.
   */
  async applyRelationOperation(
    userId: string,
    operation: MemoryOperation,
    triple: GraphTriple
  ): Promise<GraphRelation | null> {
    const subject = await this.ensureEntity(userId, triple.subject, triple.subjectKind ?? "entity");
    const object = await this.ensureEntity(userId, triple.object, triple.objectKind ?? "entity");

    switch (operation) {
      case "replace": {
        // Archive any active relation of the same subject+predicate to a different object.
        await prisma.memoryRelation.updateMany({
          where: { userId, subjectId: subject.id, relation: triple.relation, status: "active", NOT: { objectId: object.id } },
          data: { status: "archived" },
        });
        return this.addTriple(userId, triple);
      }
      case "remove":
      case "archive": {
        await prisma.memoryRelation.updateMany({
          where: { userId, subjectId: subject.id, objectId: object.id, relation: triple.relation, status: "active" },
          data: { status: "archived" },
        });
        return null;
      }
      case "strengthen": {
        const rel = await prisma.memoryRelation.findFirst({
          where: { userId, subjectId: subject.id, objectId: object.id, relation: triple.relation },
          include: { subject: true, object: true },
        });
        if (!rel) return this.addTriple(userId, triple);
        const updated = await prisma.memoryRelation.update({
          where: { id: rel.id },
          data: { strength: Math.min(1, rel.strength + 0.2) },
          include: { subject: true, object: true },
        });
        return relationToGraph(updated);
      }
      case "weaken": {
        const rel = await prisma.memoryRelation.findFirst({
          where: { userId, subjectId: subject.id, objectId: object.id, relation: triple.relation },
        });
        if (rel) {
          await prisma.memoryRelation.update({ where: { id: rel.id }, data: { strength: Math.max(0, rel.strength - 0.2) } });
        }
        return null;
      }
      case "append":
      case "create":
      default:
        return this.addTriple(userId, triple);
    }
  },

  /**
   * Memory Reasoning Layer: combine structured graph facts with semantic vector
   * recall. The graph provides factual, relationship-driven context (e.g. "prefers
   * Hyatt", "travels_to Japan") while vectors supply fuzzy personal context.
   * Returns both so the caller can build a rich, explainable prompt.
   */
  async reason(userId: string, query: string, opts: { category?: string; limit?: number } = {}): Promise<{
    graph: GraphRelation[];
    semantic: RetrievedMemory[];
  }> {
    const category = opts.category;
    const [graph, semantic] = await Promise.all([
      this.queryGraph(userId, { category, limit: opts.limit ?? 12 }),
      this.recall(userId, query, { category, limit: opts.limit ?? 6 }),
    ]);
    return { graph, semantic };
  },
};

function relationToGraph(row: {
  id: string;
  relation: string;
  strength: number;
  status: string;
  subject: { id: string; name: string; kind: string };
  object: { id: string; name: string; kind: string };
}): GraphRelation {
  return {
    id: row.id,
    relation: row.relation,
    strength: row.strength,
    status: row.status as MemoryStatus,
    subject: { id: row.subject.id, name: row.subject.name, kind: row.subject.kind },
    object: { id: row.object.id, name: row.object.name, kind: row.object.kind },
  };
}
