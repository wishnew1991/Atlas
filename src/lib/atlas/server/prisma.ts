import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

type Path = (string | symbol)[];

async function getClient(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  let client: PrismaClient;
  if (process.env.NEXT_RUNTIME === "edge") {
    // Cloudflare Pages (next-on-pages) runs everything on Workers. The D1
    // binding is only reachable through the request context at request time.
    const [{ getRequestContext }, { PrismaD1 }] = await Promise.all([
      import("@cloudflare/next-on-pages"),
      import("@prisma/adapter-d1"),
    ]);
    const db = getRequestContext().env?.DB;
    if (!db) {
      throw new Error("D1 binding `DB` is not available in the request context.");
    }
    const { PrismaClient: EdgePrismaClient } = await import("@prisma/client/edge");
    client = new EdgePrismaClient({ adapter: new PrismaD1(db) });
  } else if (process.env.DATABASE_URL?.startsWith("postgres")) {
    // GCP Cloud Run (NODE_RUNTIME=nodejs). Postgres via the node-postgres adapter.
    const { PrismaPg } = await import("@prisma/adapter-pg");
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  } else {
    // Local development (Node.js `next dev`) falls back to better-sqlite3.
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    client = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:./dev.db" }),
    });
  }

  globalForPrisma.prisma = client;
  return client;
}

export function makeLazyProxy(
  resolveClient: () => Promise<unknown> = getClient,
  path: (string | symbol)[] = []
): unknown {
  const call = (...args: unknown[]) => {
    const segments = path;
    return resolveClient().then((client) => {
      let owner: unknown = client;
      let target: unknown = client;
      for (const segment of segments) {
        owner = target;
        target = (target as Record<string | symbol, unknown>)[segment];
      }
      if (typeof target !== "function") {
        throw new Error(
          `Prisma path "${segments.join(".")}" resolved to a non-function value.`
        );
      }
      // Preserve `this` on the owning object so client methods that read
      // instance state (e.g. `$transaction` accessing `this._tracingHelper`)
      // run with the correct receiver instead of an undefined one.
      return (target as (...callArgs: unknown[]) => unknown).apply(owner, args);
    });
  };

  return new Proxy(call, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return makeLazyProxy(resolveClient, [...path, prop]);
    },
    apply(_target, _thisArg, args) {
      return call(...args);
    },
  });
}

export const prisma = makeLazyProxy() as PrismaClient;