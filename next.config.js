/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "@prisma/adapter-d1",
    "better-sqlite3",
    ".prisma/client",
  ],
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = { type: "memory" };
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
