import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "scripts", "test-agent", "setup.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/test-agent/**/*.test.ts", "src/lib/validation/__tests__/**/*.test.ts"],
    pool: "forks",
    testTimeout: 30000,
  },
});
