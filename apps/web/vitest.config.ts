import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path mapping, which
      // TypeScript resolves at typecheck time but Vite/vitest doesn't pick
      // up on its own. Existing tests avoided needing this by vi.mock()-ing
      // every "@/..." import they touch; the emails tests exercise real
      // rendering/translation, so they need actual resolution.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // token-seal.ts imports "server-only", which throws outside a React
      // Server Components bundle; stub it for tests.
      "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname,
    },
  },
});
