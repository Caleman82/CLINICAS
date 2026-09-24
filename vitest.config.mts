import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/db/setup-global.ts"],
    // Los tests de base comparten una única base de datos.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
