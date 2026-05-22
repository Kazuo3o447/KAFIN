/**
 * SQLite-Schema (Drizzle). Postgres-portierbar.
 * Siehe docs/ARCHITECTURE.md §4.
 */
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const reports = sqliteTable(
  "reports",
  {
    id: text("id").primaryKey(), // ulid
    ticker: text("ticker").notNull(),
    exchange: text("exchange"),
    companyName: text("company_name"),
    researchDate: text("research_date").notNull(), // YYYY-MM-DD
    runId: text("run_id").notNull().unique(),
    category: text("category"),
    gate: text("gate"), // Green | Yellow | Red
    scoreTotal: integer("score_total"),
    scoreBreakdown: text("score_breakdown"), // json
    confidence: text("confidence"), // low | medium | high
    reportMdPath: text("report_md_path"),
    reportJsonPath: text("report_json_path"),
    rawDir: text("raw_dir"),
    createdAt: integer("created_at").notNull(),
    durationMs: integer("duration_ms"),
    modelExtract: text("model_extract"),
    modelScoring: text("model_scoring"),
    modelSummary: text("model_summary"),
    hardBlockers: text("hard_blockers"), // json array
    handoffToTradeEngine: integer("handoff_to_trade_engine").default(0),
  },
  (t) => ({
    tickerDateIdx: index("reports_ticker_date_idx").on(t.ticker, t.researchDate),
  }),
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    ticker: text("ticker").notNull(),
    status: text("status").notNull(), // queued | running | done | failed | cancelled
    progress: integer("progress").default(0),
    error: text("error"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
    reportId: text("report_id"),
  },
  (t) => ({
    statusIdx: index("runs_status_idx").on(t.status, t.startedAt),
  }),
);

export const watchlist = sqliteTable("watchlist", {
  ticker: text("ticker").primaryKey(),
  addedAt: integer("added_at").notNull(),
  notes: text("notes"),
  lastReportId: text("last_report_id"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // json blob
  updatedAt: integer("updated_at").notNull(),
});

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reportId: text("report_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    klass: text("class"), // A | A- | B | B- | C | D | E
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => ({
    reportIdx: index("sources_report_idx").on(t.reportId),
  }),
);

export const peerMetrics = sqliteTable(
  "peer_metrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reportId: text("report_id").notNull(),
    ticker: text("ticker").notNull(),
    bucketId: text("bucket_id").notNull(),
    computedAt: integer("computed_at").notNull(),
    percentilesJson: text("percentiles_json").notNull(),  // JSON object
    vsMedianJson: text("vs_median_json").notNull(),       // JSON object
    computedKeys: text("computed_keys").notNull(),        // JSON array of keys
  },
  (t) => ({
    reportIdx: index("peer_metrics_report_idx").on(t.reportId),
    tickerIdx: index("peer_metrics_ticker_idx").on(t.ticker),
  }),
);
