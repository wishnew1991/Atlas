import type { D1Database } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    DB: D1Database;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
  }

  namespace NodeJS {
    interface ProcessEnv {
      // GCP Cloud Run (PostgreSQL runtime)
      DATABASE_URL?: string;
      BETTER_AUTH_URL?: string;
      BETTER_AUTH_SECRET?: string;
      BETTER_AUTH_TRUSTED_ORIGINS?: string;
      ATLAS_ADMIN_USER_IDS?: string;
      ATLAS_MODEL?: string;
      ATLAS_SECRET_KEY?: string;
      OPENAI_API_KEY?: string;
      REDIS_URL?: string;
    }
  }
}

export {};