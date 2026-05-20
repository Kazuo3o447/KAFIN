import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/storage/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/research.db",
  },
  strict: true,
  verbose: true,
} satisfies Config;
