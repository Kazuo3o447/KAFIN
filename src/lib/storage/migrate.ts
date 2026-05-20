/**
 * Migration-Runner: idempotent + Reset bei Schema-Drift.
 * Wenn die `__drizzle_migrations` Tabelle keine bekannten Hashes enthält oder
 * fremde Tabellen vorhanden sind, wird der DB-State verworfen.
 * Aufruf: `npm run db:migrate`
 */
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./db";

const KNOWN_TABLES = new Set([
  "reports",
  "runs",
  "watchlist",
  "settings",
  "sources",
  "__drizzle_migrations",
  "sqlite_sequence",
]);

const tables: { name: string }[] = sqlite
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all() as { name: string }[];

const hasUnknown = tables.some((t) => !KNOWN_TABLES.has(t.name));
const hasOldSchema =
  tables.some((t) => ["companies", "research_runs", "watchlist_items", "logs"].includes(t.name));

if (hasUnknown || hasOldSchema) {
  console.log("Schema-Drift erkannt – verwerfe DB-State:", tables.map((t) => t.name).join(", "));
  // Drop ALL non-system tables to reset
  for (const t of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS \`${t.name}\`;`);
  }
}

migrate(db, { migrationsFolder: "./drizzle/migrations" });
console.log("DB Migrationen angewendet.");
