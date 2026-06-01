import Database from "better-sqlite3";
import path from "node:path";

const DATA_DIR = process.env.DATA_DIR || "./data";
const DB_PATH = process.env.DATABASE_URL || path.join(DATA_DIR, "research.db");

function safeReadSettingsValue(key: string): string | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ? LIMIT 1")
      .get(key) as { value?: string } | undefined;
    const raw = row?.value;
    if (typeof raw !== "string") return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return raw;
    }
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export function readSettingString(key: string): string | null {
  return safeReadSettingsValue(key);
}

export function readSecretFromEnvOrSettings(envKey: string, settingsKey: string): string {
  return process.env[envKey] ?? readSettingString(settingsKey) ?? "";
}
