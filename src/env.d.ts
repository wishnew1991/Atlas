import type { D1Database } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
  }
}

export {};