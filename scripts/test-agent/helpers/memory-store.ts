import type { MemoryRecord, MemoryType, MemoryStatus } from "@/lib/atlas/memory/service";

interface StoreRow {
  id: string;
  userId: string;
  kind: string;
  type: string;
  text: string;
  embedding: string | null;
  confidence: number;
  importance: number;
  status: string;
  accessCount: number;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date;
}

interface EntityRow {
  id: string;
  userId: string;
  name: string;
  kind: string;
  createdAt: Date;
}

interface RelationRow {
  id: string;
  userId: string;
  subjectId: string;
  objectId: string;
  relation: string;
  strength: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  subject?: EntityRow;
  object?: EntityRow;
}

let idCounter = 0;
function cuid(): string {
  return `mem_${String(++idCounter).padStart(8, "0")}`;
}

export class InMemoryMemoryStore {
  memories: Map<string, StoreRow> = new Map();
  entities: Map<string, EntityRow> = new Map();
  entityById: Map<string, EntityRow> = new Map();
  relations: Map<string, RelationRow> = new Map();

  reset(): void {
    this.memories.clear();
    this.entities.clear();
    this.entityById.clear();
    this.relations.clear();
    idCounter = 0;
  }

  // -- Memory CRUD --

  create(data: Omit<StoreRow, "id" | "createdAt" | "updatedAt" | "lastUsedAt">): StoreRow {
    const now = new Date();
    const row: StoreRow = {
      id: cuid(),
      ...data,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    };
    this.memories.set(row.id, row);
    return row;
  }

  findMany(where: Record<string, unknown>, opts?: Partial<{ orderBy: unknown; take: number }>): StoreRow[] {
    let results = Array.from(this.memories.values());

    for (const [key, value] of Object.entries(where)) {
      if (value === undefined || value === null) continue;

      if (key === "OR" && Array.isArray(value)) {
        results = results.filter((row) =>
          value.some((cond: Record<string, unknown>) => this.matchesOr(row, cond))
        );
      } else if (key === "NOT" && typeof value === "object") {
        results = results.filter((row) => !this.matchesOr(row, value as Record<string, unknown>));
      } else if (key === "status") {
        results = results.filter((row) => row.status === value);
      } else if (key === "type" && typeof value === "object" && (value as Record<string, unknown>)["in"]) {
        const inValues = (value as Record<string, unknown>)["in"] as string[];
        results = results.filter((row) => inValues.includes(row.type));
      } else if (key === "id" && typeof value === "object" && (value as Record<string, unknown>)["in"]) {
        const inValues = (value as Record<string, unknown>)["in"] as string[];
        results = results.filter((row) => inValues.includes(row.id));
      } else if (key === "expiresAt" && typeof value === "object" && value !== null) {
        const v = value as Record<string, unknown>;
        if (v["lt"] !== undefined) {
          results = results.filter((row) => row.expiresAt !== null && row.expiresAt < (v["lt"] as Date));
        } else if (v["gt"] !== undefined) {
          results = results.filter((row) => row.expiresAt !== null && row.expiresAt > (v["gt"] as Date));
        }
      } else {
        results = results.filter((row) => (row as unknown as Record<string, unknown>)[key] === value);
      }
    }

    if (opts?.orderBy) {
      results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }
    if (opts?.take !== undefined) {
      results = results.slice(0, opts.take);
    }

    return results;
  }

  private matchesOr(row: StoreRow, cond: Record<string, unknown>): boolean {
    if (cond["expiresAt"] === null) return row.expiresAt === null;
    if (cond["expiresAt"] && typeof cond["expiresAt"] === "object") {
      const gt = (cond["expiresAt"] as Record<string, unknown>)["gt"] as Date;
      return row.expiresAt !== null && row.expiresAt > gt;
    }
    return true;
  }

  findUnique(where: Record<string, string>): StoreRow | null {
    const id = where.id || where.id;
    return this.memories.get(id) ?? null;
  }

  update(where: { id: string }, data: Record<string, unknown>): StoreRow | null {
    const row = this.memories.get(where.id);
    if (!row) return null;
    Object.assign(row, data, { updatedAt: new Date() });
    return row;
  }

  updateMany(where: Record<string, unknown>, data: Record<string, unknown>): { count: number } {
    const matches = this.findMany(where);
    for (const row of matches) {
      const resolved: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "object" && value !== null && "increment" in (value as Record<string, unknown>)) {
          resolved[key] = ((row as unknown as Record<string, unknown>)[key] as number) + ((value as Record<string, unknown>).increment as number);
        } else if (typeof value === "object" && value !== null && "decrement" in (value as Record<string, unknown>)) {
          resolved[key] = ((row as unknown as Record<string, unknown>)[key] as number) - ((value as Record<string, unknown>).decrement as number);
        } else {
          resolved[key] = value;
        }
      }
      Object.assign(row, resolved, { updatedAt: new Date() });
    }
    return { count: matches.length };
  }

  deleteMany(where: Record<string, unknown>): { count: number } {
    const matches = this.findMany(where);
    for (const row of matches) {
      this.memories.delete(row.id);
    }
    return { count: matches.length };
  }

  // -- Entity CRUD --

  entityUpsert(where: { userId_name: { userId: string; name: string } }, create: Omit<EntityRow, "id" | "createdAt">, update: Record<string, unknown>): EntityRow {
    const key = `${where.userId_name.userId}:${where.userId_name.name}`;
    const existing = this.entities.get(key);
    if (existing) {
      Object.assign(existing, update);
      return existing;
    }
    const id = cuid();
    const row: EntityRow = { id, ...create, createdAt: new Date() };
    this.entities.set(key, row);
    this.entityById.set(id, row);
    return row;
  }

  // -- Relation CRUD --

  relationFindFirst(where: Record<string, unknown>, include?: { subject?: boolean; object?: boolean }): RelationRow | null {
    const all = Array.from(this.relations.values());
    for (const row of all) {
      if (this.relationMatches(row, where)) {
        return include ? this.includeRelations(row) : row;
      }
    }
    return null;
  }

  relationFindMany(where: Record<string, unknown>, opts?: Partial<{ orderBy: unknown; take: number; include: { subject: boolean; object: boolean } }>): RelationRow[] {
    let results = Array.from(this.relations.values());
    for (const [key, value] of Object.entries(where)) {
      if (key === "relation" && typeof value === "object" && (value as Record<string, unknown>)["in"]) {
        const inValues = (value as Record<string, unknown>)["in"] as string[];
        results = results.filter((r) => inValues.includes(r.relation));
      } else if (key === "subject" && typeof value === "object") {
        const name = (value as Record<string, string>)["name"];
        results = results.filter((r) => r.subjectId && this.entityById.get(r.subjectId)?.name === name);
      } else if (key === "object" && typeof value === "object") {
        const name = (value as Record<string, string>)["name"];
        results = results.filter((r) => r.objectId && this.entityById.get(r.objectId)?.name === name);
      } else {
        results = results.filter((r) => (r as unknown as Record<string, unknown>)[key] === value);
      }
    }
    if (opts?.orderBy) results.sort((a, b) => b.strength - a.strength);
    if (opts?.take) results = results.slice(0, opts.take);
    if (opts?.include) results = results.map((r) => this.includeRelations(r));
    return results;
  }

  relationCreate(data: Omit<RelationRow, "id" | "createdAt" | "updatedAt">, include?: { subject?: boolean; object?: boolean }): RelationRow {
    const now = new Date();
    const dataStatus = (data as Record<string, unknown>).status as string | undefined;
    const row: RelationRow = { id: cuid(), ...data, createdAt: now, updatedAt: now, status: dataStatus ?? "active" };
    this.relations.set(row.id, row);
    return include ? this.includeRelations(row) : row;
  }

  relationUpdate(where: { id: string }, data: Record<string, unknown>, include?: { subject?: boolean; object?: boolean }): RelationRow | null {
    const row = this.relations.get(where.id);
    if (!row) return null;
    Object.assign(row, data, { updatedAt: new Date() });
    return include ? this.includeRelations(row) : row;
  }

  relationUpdateMany(where: Record<string, unknown>, data: Record<string, unknown>): { count: number } {
    const all = Array.from(this.relations.values());
    let count = 0;
    for (const row of all) {
      if (this.relationMatches(row, where)) {
        Object.assign(row, data, { updatedAt: new Date() });
        count++;
      }
    }
    return { count };
  }

  private relationMatches(row: RelationRow, where: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (key === "NOT" && typeof value === "object") {
        const notCond = value as Record<string, unknown>;
        if (notCond["objectId"]) {
          if (notCond["objectId"] === row.objectId) return false;
        }
      } else if ((row as unknown as Record<string, unknown>)[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private includeRelations(row: RelationRow): RelationRow {
    return {
      ...row,
      subject: row.subjectId ? this.entityById.get(row.subjectId) ?? undefined : undefined,
      object: row.objectId ? this.entityById.get(row.objectId) ?? undefined : undefined,
    };
  }
}

export const memoryStore = new InMemoryMemoryStore();
