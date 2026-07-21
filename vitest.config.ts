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
  },
});
