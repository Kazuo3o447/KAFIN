import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_URL || path.join(process.env.DATA_DIR || "./data", "research.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
	CREATE TABLE IF NOT EXISTS score_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
		report_id TEXT NOT NULL UNIQUE,
		ticker TEXT NOT NULL,
		research_date TEXT NOT NULL,
		score_total INTEGER NOT NULL,
		gate TEXT NOT NULL,
		confidence TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		delta_from_previous INTEGER,
		trend TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS score_history_ticker_date_idx ON score_history (ticker, research_date);
	CREATE INDEX IF NOT EXISTS score_history_ticker_idx ON score_history (ticker);
`);

// P3 migration: add three-axis columns if they don't exist yet (idempotent)
for (const col of [
  "ALTER TABLE score_history ADD COLUMN axes_json TEXT",
  "ALTER TABLE score_history ADD COLUMN safety_status TEXT",
  "ALTER TABLE score_history ADD COLUMN archetype TEXT",
]) {
  try { sqlite.exec(col); } catch { /* column already exists */ }
}

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, { schema });
export { schema, sqlite };
