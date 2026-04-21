import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://pinterest:pinterest@localhost:5432/pinterest_automation",
  },
  strict: true,
  verbose: true,
} satisfies Config;
