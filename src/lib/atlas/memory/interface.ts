export interface MemoryEntry {
  role: "user" | "assistant";
  text: string;
  at: number;
}

export interface MemoryResult {
  entries: MemoryEntry[];
}

export interface MemoryInterface {
  load(userId: string): Promise<MemoryResult>;
  save(userId: string, entry: MemoryEntry): Promise<void>;
}

export class NoOpMemory implements MemoryInterface {
  async load(): Promise<MemoryResult> {
    return { entries: [] };
  }

  async save(): Promise<void> {
    /* intentionally unused — long-term memory is a future capability */
  }
}

export const memory: MemoryInterface = new NoOpMemory();
