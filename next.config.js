/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "@prisma/adapter-d1",
    "better-sqlite3",
    ".prisma/client",
  ],
webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.cache = { type: "memory" };
    }
    // Bundle flow guides (.md under src/lib/atlas/flows) as raw text so they
    // work on Workers (no fs access at runtime).
    config.module.rules.push({
      test: /[/\\]flows[/\\].*\.md$/,
      type: "asset/source",
    });
    // Leave Node builtins external so edge bundles resolve them at runtime
    // (Workers provides these under nodejs_compat; Node covers local dev).
    if (isServer) {
      const nodeBuiltins = [
        "node:child_process",
        "node:crypto",
        "node:fs",
        "node:fs/promises",
        "node:path",
        "node:os",
        "node:stream",
        "node:stream/promises",
        "node:util",
        "node:events",
        "node:buffer",
        "node:url",
        "node:zlib",
        "node:http",
        "node:https",
        "node:net",
        "node:tls",
        "node:querystring",
        "node:string_decoder",
        "node:timers",
        "node:assert",
        "node:tty",
        "node:worker_threads",
        "node:perf_hooks",
      ];
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        function externalCallback({ request }, callback) {
          if (typeof request === "string" && nodeBuiltins.includes(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rickandmortyapi.com",
        port: "",
        pathname: "/api/character/avatar/**",
      },
    ],
  },
};

module.exports = nextConfig;
