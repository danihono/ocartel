import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve o alias "@/..." (mesmo do tsconfig) para os testes rodarem sem build.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Os testes de regras precisam do emulador do Firestore de pé — rodam por
    // `npm run test:rules` (vitest.rules.config.ts), não nesta suíte.
    exclude: ["node_modules/**", "tests/rules/**"],
  },
});
