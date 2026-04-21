import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      LOG_LEVEL: "fatal",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["dist/**", "tests/**", "**/*.config.*"],
    },
  },
});
