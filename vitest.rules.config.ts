import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Suíte das FIREBASE SECURITY RULES. Separada porque exige o emulador do Firestore de pé —
// quem a roda é `npm run test:rules`, via `firebase emulators:exec`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    // Um único worker: todos os casos compartilham a mesma instância do emulador, e
    // limpar o banco entre eles em paralelo faria um teste apagar o dado do outro.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
