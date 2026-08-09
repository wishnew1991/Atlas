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
  } else {
    // Local development (Node.js `next dev`) falls back to better-sqlite3.
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    client = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: "file:./dev.db" }),
    });
  }

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

function makeLazyProxy(path: (string | symbol)[] = []): unknown {
  const call = (...args: unknown[]) => {
    const segments = path;
    return getClient().then((client) => {
      let target: unknown = client as unknown;
      for (const segment of segments) {
        target = (target as Record<string | symbol, unknown>)[segment];
      }
      if (typeof target !== "function") {
        throw new Error(
          `Prisma path "${segments.join(".")}" resolved to a non-function value.`
        );
      }
      return (target as (...callArgs: unknown[]) => unknown)(...args);
    });
  };

  return new Proxy(call, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return makeLazyProxy([...path, prop]);
    },
    apply(_target, _thisArg, args) {
      return call(...args);
    },
  });
}

export const prisma = makeLazyProxy() as PrismaClient;