import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // token-seal.ts imports "server-only", which throws outside a React
      // Server Components bundle; stub it for tests.
      "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname,
    },
  },
});
