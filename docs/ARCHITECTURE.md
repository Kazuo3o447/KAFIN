# ARCHITECTURE.md

> **Pflicht:** Jede Änderung an Modulen, Datenfluss, Schemas oder Schnittstellen muss hier dokumentiert werden — synchron mit dem Code-Change. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

---

## 1. High-Level

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (React 18, Tailwind)                                    │
│  Pages: Home · Run · Reports · Watchlist · Settings · Logs       │
└──────────────────────────────────────────────────────────────────┘
                     │  HTTP (App Router) · SSE (Live-Log)
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Next.js 14 (Node 20) – API Routes + React Server Components     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │ Orchestr.│ │ Providers│ │  Scoring │ │ Storage  │ │ Export │ │
│  │ pipeline │ │ (Adapter)│ │ (det. TS)│ │ Drizzle  │ │        │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │
│       │            │            │            │            │      │
│       ▼            ▼            ▼            ▼            ▼      │
│  LLM-Router    yfinance      Pure TS      SQLite      pptxgenjs  │
│  (config.ts)   SEC EDGAR                  FS atomic   exceljs    │
│       │        FMP / AV                   audit.jsonl puppeteer  │
│       ├─ Ollama RSS Parser                                       │
│       └─ DeepSeek                                                │
└──────────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  Filesystem (./data)                                             │
│  research.db · raw/ · logs/audit.jsonl · logs/runs.jsonl         │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Verzeichnisstruktur

```
kafin/
├── 1index.html                  # Pilot, bleibt als Referenz
├── research.md                  # fachliche Spec (verbindlich)
├── docs/
│   ├── MANIFEST.md
│   ├── ARCHITECTURE.md
│   ├── AGENT.md
│   └── STATUS.md
├── docker-compose.yml
├── Dockerfile                   # multi-stage: deps → build → runner
├── .env.example
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── drizzle.config.ts
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # Dark-Mode default, Toast-Container, Header
│   │   ├── page.tsx             # Dashboard (Übersicht)
│   │   ├── run/[ticker]/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── reports/[id]/page.tsx
│   │   ├── watchlist/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── logs/page.tsx
│   │   └── api/
│   │       ├── runs/route.ts            # POST start, GET list
│   │       ├── runs/[id]/route.ts       # GET status/result, DELETE cancel
│   │       ├── runs/[id]/stream/route.ts# SSE: live log + progress
│   │       ├── reports/route.ts
│   │       ├── reports/[id]/route.ts
│   │       ├── reports/[id]/export/route.ts  # ?format=pdf|xlsx|pptx
│   │       ├── watchlist/route.ts
│   │       ├── ollama/models/route.ts   # proxy /api/tags
│   │       ├── settings/route.ts
│   │       └── health/route.ts
│   ├── components/
│   │   ├── layout/Header.tsx
│   │   ├── layout/Sidebar.tsx
│   │   ├── ui/GlassCard.tsx
│   │   ├── ui/Toast.tsx
│   │   ├── ui/Gauge.tsx              # SVG, Score 0–100
│   │   ├── ui/RadarChart.tsx         # 7 Score-Blöcke
│   │   ├── ui/KpiCard.tsx
│   │   ├── ui/AuditTabs.tsx          # horizontale Tabs aus Pilot
│   │   ├── ui/LogPanel.tsx           # konsumiert SSE
│   │   ├── ui/SourceList.tsx
│   │   ├── ui/PrecisionPanel.tsx     # aus Pilot
│   │   ├── run/TickerInput.tsx
│   │   ├── run/ModelSelector.tsx     # per-Step Override
│   │   ├── run/RunProgress.tsx
│   │   └── report/ReportView.tsx
│   ├── lib/
│   │   ├── orchestrator/
│   │   │   ├── pipeline.ts           # baseFacts → questions → scoring → summary
│   │   │   ├── steps.ts
│   │   │   └── events.ts             # EventEmitter → SSE
│   │   ├── providers/
│   │   │   ├── types.ts              # interface DataProvider
│   │   │   ├── yahoo.ts
│   │   │   ├── edgar.ts
│   │   │   ├── fmp.ts
│   │   │   ├── alphavantage.ts
│   │   │   └── rss.ts
│   │   ├── llm/
│   │   │   ├── ollama.ts             # client wrapper + audit
│   │   │   ├── prompts/              # *.md templates (research.md §22 etc.)
│   │   │   └── repair.ts             # JSON-Repair pass
│   │   ├── scoring/
│   │   │   ├── weights.ts            # Block-Gewichte (research.md §9)
│   │   │   ├── blocks/
│   │   │   │   ├── growth.ts
│   │   │   │   ├── unitEconomics.ts
│   │   │   │   ├── quality.ts
│   │   │   │   ├── valuation.ts
│   │   │   │   ├── capital.ts
│   │   │   │   ├── catalysts.ts
│   │   │   │   └── risk.ts
│   │   │   ├── gate.ts               # Green/Yellow/Red + Hard-Blocker
│   │   │   └── category.ts           # Rocket / Quality Growth / ...
│   │   ├── storage/
│   │   │   ├── db.ts                 # Drizzle client
│   │   │   ├── schema.ts             # Tabellen
│   │   │   ├── reports.ts            # MD+JSON writer (atomar)
│   │   │   ├── raw.ts                # Roh-Artefakt Writer
│   │   │   └── audit.ts              # JSONL append
│   │   ├── export/
│   │   │   ├── pdf.ts                # puppeteer von /reports/[id]?print=1
│   │   │   ├── xlsx.ts
│   │   │   └── pptx.ts
│   │   ├── schemas/
│   │   │   ├── report.ts             # Zod nach research.md §21
│   │   │   ├── score.ts
│   │   │   └── settings.ts
│   │   ├── logging/
│   │   │   ├── pino.ts
│   │   │   └── ui-log.ts             # SSE-Format
│   │   └── utils/
│   │       ├── ulid.ts
│   │       ├── atomic-write.ts
│   │       └── cache.ts
│   └── styles/
│       └── globals.css               # Dark-Tokens aus 1index.html portiert
├── drizzle/
│   └── migrations/
├── tests/
│   ├── unit/
│   └── e2e/
└── data/                              # gemounted im Container
    ├── research.db
    ├── reports/
    ├── raw/
    ├── logs/
    └── cache/
```

---

## 3. Datenfluss eines Research-Runs

```
POST /api/runs { ticker, modelOverride?:{extract,scoring,summary} }
   │
   ▼
runPipeline(runId, ticker)  — alles in einem try/catch; Fehler → SSE error-Event
   │
   ├─ Phase 1 (sequentiell):
   │   ├─ 1. stepFetchBaseData()    ── Provider parallel: yfinance, FMP, EDGAR, RSS
   │   │     emit("progress", 15%)
   │   │
   │   ├─ 2. stepDeriveMetrics()   ── deterministisch: Rule-of-40, CAGR, SBC%, etc.
   │   │     emit("progress", 22%)
   │   │
   │   └─ 3. stepBuildContext()    ── Facts + Quellen-Snippets → context + blockContexts
   │         emit("progress", 30%)
   │
   ├─ Phase 2 (PARALLEL — größter Laufzeit-Gewinn):
   │   ├─ 4a. stepExtractFacts()   ── LLM: key_metrics + identity aus globalem Context
   │   │       model: modelExtract, temp: 0.1, context: max 18.000 Zeichen
   │   └─ 4b. stepAnswerSections() ── LLM: Blöcke A–G, concurrency=7
   │           model: modelScoring, temp: 0.2, context: max 12.000 Zeichen/Block
   │           rationale: max 10 Wörter/Indikator
   │     emit("progress", 70%)
   │
   └─ Phase 3 (sequentiell):
       ├─ 5. stepComputeScoreAndGate() ── deterministisch: Gewichte → Score 0–100,
       │     emit("progress", 80%)        Gate Green/Yellow/Red, Hard-Blocker
       │
       ├─ 6. stepSummarize()       ── LLM: Bull/Bear/Thesis/Catalysts
       │     emit("progress", 92%)    model: modelSummary, temp: 0.4
       │
       └─ 7. stepPersist()         ── atomar: MD+JSON schreiben, DB-Row, Audit
             emit("done", 100%, reportId)
```

### LLM-Routing (seit Update 8)

`chatJSON()` in `ollama.ts` liest via `getLLMConfig()` den aktiven Provider aus der DB:

```
chatJSON(opts)
   │
   ├─ getLLMConfig().provider === "deepseek"
   │     └─ chatJSONDeepSeek(opts, apiKey, model)
   │         POST https://api.deepseek.com/chat/completions
   │         response_format: { type: "json_object" }
   │
   └─ provider === "ollama"
         └─ ollama.chat({ ...opts, stream: true })
             akkumuliert Tokens aus AsyncIterable
             (stream:true → kein undici headersTimeout)
```

### SSE-Event-Bus

```
ensureRunBus(runId)  — globalThis.__kafinRunBus (Map, geteilt über alle Route-Module)
   │
   ├─ emitRun(runId, event, data)   ── buffert + emitter.emit()
   ├─ getBuffer(runId)              ── replay bei Late-Connect
   └─ isDone(runId)                 ── stream sofort schließen wenn bereits fertig
```

> **Wichtig:** `bus` hängt an `globalThis.__kafinRunBus` — notwendig weil Next.js-Dev-Mode jede Route-Datei in einer eigenen Modul-Instanz evaluiert. Ohne globalThis würden POST `/api/runs` und GET `/api/runs/[id]/stream` verschiedene Map-Instanzen sehen → leerer Buffer.

---

**Cancel:** `DELETE /api/runs/:id` setzt Abort-Flag, alle In-Flight-`fetch`/Ollama-Streams werden via `AbortController` abgebrochen. Teil-Artefakte bleiben unter `raw/`.

**SSE-Topics:** `log`, `progress`, `step:start`, `step:done`, `error`, `done`.

---

## 4. Datenbank-Schema (Drizzle, SQLite-Dialekt)

```ts
// reports
id: text primary key (ulid)
ticker: text not null
exchange: text
company_name: text
research_date: text not null     // YYYY-MM-DD
run_id: text not null unique
category: text                    // Rocket | Quality Growth | ...
gate: text                        // Green | Yellow | Red
score_total: integer              // 0..100
score_breakdown: text (json)
confidence: text                  // low | medium | high
report_md_path: text
report_json_path: text
raw_dir: text
created_at: integer (unix)
duration_ms: integer
model_extract: text
model_scoring: text
model_summary: text
hard_blockers: text (json array)
handoff_to_trade_engine: integer (0|1)

// runs (audit, auch failed)
id: text primary key
ticker: text
status: text   // queued | running | done | failed | cancelled
progress: integer
error: text
started_at, finished_at: integer
report_id: text nullable → reports.id

// watchlist
ticker: text primary key
added_at: integer
notes: text
last_report_id: text nullable

// settings
key: text primary key
value: text  // json blob
updated_at: integer

// sources (pro Report)
id: integer pk autoincrement
report_id: text → reports.id
url: text
title: text
class: text   // A | A- | B | B- | C | D | E
fetched_at: integer

// indexes
reports(ticker, research_date desc)
runs(status, started_at desc)
```

---

## 5. UI — Pages

| Route | Inhalt | Pilot-Vorbild |
|---|---|---|
| `/` Dashboard | Letzte Reports, Watchlist-Snapshot, KPI-Tiles (Anzahl Reports, Ø Score, Gate-Verteilung, Top 5 Score, Letzte Fehler) | "Übersicht"-Kacheln |
| `/run/[ticker]` (Detail) | Live-Lauf: Step-Progress, Log-Panel, abbrechbar | "Audit läuft"-View |
| `/reports` | Tabelle + Filter (Ticker, Datum, Gate, Kategorie, Score-Range) | Tab "Berichte" |
| `/reports/[id]` (**Audit-Dashboard**) | siehe §6 | Tab "Auswertung" |
| `/reports/[id]/compare?vs=[id2]` | Diff zweier Runs (Score-Δ, Metrik-Δ) | neu |
| `/watchlist` | Ticker-Verwaltung, Quick-Run-Button | – |
| `/settings` | Ollama-Modelle, API-Keys, Defaults, Daten-Pfade | "Einstellungen" + Passwort entfällt |
| `/logs` | `audit.jsonl` Live-Tail + Filter | "Log"-Tab |

---

## 6. Audit-Dashboard (`/reports/[id]`) — Layout

> Ziel: alle relevanten KPIs, Grafiken und Scorings *auf einer Seite, ohne Scroll-Suche*. Übernimmt Glass-Cards, Score-Strip (rot/gelb/grün), Tab-Bar aus Pilot.

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: NVDA · NASDAQ · 2026-05-20 · Run abc… · Modell: llama3.1│
│  [Export PDF] [Export XLSX] [Export PPTX] [Re-Run] [Watchlist★] │
└──────────────────────────────────────────────────────────────────┘

Row 1 – Hero (3 Spalten)
┌──────────────┬──────────────┬─────────────────────────────────────┐
│ GAUGE         │ GATE Badge    │ KATEGORIE Badge                    │
│ Score 78/100  │ GREEN         │ Quality Growth                     │
│ (SVG, Pilot)  │ + Confidence  │ + 1-Satz-These                     │
└──────────────┴──────────────┴─────────────────────────────────────┘

Row 2 – Radar + KPI-Strip
┌────────────────────────┬─────────────────────────────────────────┐
│ Radar (7 Achsen,       │ KPI-Cards (3×3 Grid)                    │
│ Block A–G Sub-Scores)  │ Rev Growth · GM · OM · FCF Margin       │
│                        │ ROIC · Rule of 40 · Share Cnt Δ · SBC % │
│                        │ NTM P/E · EV/Sales · PEG · Beta         │
└────────────────────────┴─────────────────────────────────────────┘

Row 3 – Tab-Bar (horizontal, aus Pilot)
[A Growth 14/18] [B Unit Econ 9/14] [C Moat 13/18] [D Valuation 8/14]
[E Capital 10/12] [F Catalysts 8/12] [G Risk 7/12] [Sources] [Raw]

Active Tab Content:
┌──────────────────────────────────────────────────────────────────┐
│ Block-Title · Sub-Score · Begründung (LLM) · Quellen-Liste mit  │
│ Class-Badge (A/B/C) · Red-Flags Liste · Mini-Charts wo sinnvoll │
└──────────────────────────────────────────────────────────────────┘

Row 4 – Bull / Bear (2 Spalten) + Hard-Blockers + Open Questions
```

Farbsystem (aus Pilot übernommen): `score-strip-green/yellow/red` Class an `GlassCard`. Dark-Default. Toggle hellt nur Hintergründe auf.

---

## 7. Live-Log (SSE)

- Endpoint: `GET /api/runs/:id/stream` (Content-Type `text/event-stream`)
- Events:
  ```
  event: log
  data: {"ts":..,"level":"info","msg":"Fetching EDGAR filings…"}

  event: progress
  data: {"pct":35,"step":"extract"}

  event: done
  data: {"reportId":"…"}
  ```
- Frontend: `EventSource` in `LogPanel.tsx`, auto-scroll, Level-Filter, Suche, Copy-Button. Identische Optik zum Pilot-Log.

---

## 8. Ollama-Integration

- **Models-Endpoint:** `GET /api/ollama/models` ruft `GET http://ollama:11434/api/tags`, cached 30 s.
- **Inferenz:** `POST /api/chat` mit `{ model, messages, format:"json", options:{temperature} }`. Bei großen Prompts `keep_alive: "10m"`.
- **Per-Step-Override:** Settings speichern Default-Modelle; UI im `/run/[ticker]` erlaubt Override.
- **Audit:** jeder Call → `audit.append({runId, step, model, promptHash, promptFile, responseFile, ms, ok})`.

---

## 9. Konfiguration (`.env`)

```
NODE_ENV=production
PORT=3000
DATA_DIR=/data
OLLAMA_BASE_URL=http://ollama:11434
DEFAULT_MODEL_EXTRACT=llama3.1:8b-instruct
DEFAULT_MODEL_SCORING=llama3.1:8b-instruct
DEFAULT_MODEL_SUMMARY=llama3.1:8b-instruct
FMP_API_KEY=
ALPHA_VANTAGE_API_KEY=
SEC_USER_AGENT="Kafin Research <you@example.com>"
LOG_LEVEL=info
```

Keine Secrets im Repo. `.env.example` ohne Werte einchecken.

---

## 10. Docker Compose

Ollama läuft **nicht** im Compose. Es ist ein Host-Dienst (aktuell Windows + NVIDIA, später Prod auf AMD). Die App spricht es ausschließlich über HTTP an.

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    environment:
      # erreicht den Host-Ollama von Linux/Windows-Containern aus
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Linux-Hosts
    volumes: ["./data:/data"]
    restart: unless-stopped
```

**Hinweis:** Für lokale Dev-Runs ohne Container reicht `npm run dev`; `OLLAMA_BASE_URL=http://localhost:11434` in `.env`.

Phase 2: optionaler `worker`-Service (BullMQ + Redis), wenn Runs in Queue laufen sollen.

---

## 11. Aus dem Pilot zu portierende Funktionen

| Pilot | Ziel-Modul |
|---|---|
| `logger`-Pattern + farbiges Live-Log | `lib/logging/ui-log.ts` + `LogPanel.tsx` |
| `parseRobustJSON` (JSON-Repair) | `lib/llm/repair.ts` |
| `runGoogleSearch` (mit Timeout/AbortController) | nicht portiert (Google entfällt) — Muster `AbortController` bleibt |
| Glass-Cards, Score-Strip, Audit-Tabs, Toasts, Gauges | `components/ui/*` |
| Settings-Modal mit Modell-/Mode-Auswahl | `app/settings/page.tsx` |
| PPTX-Export (`pptxgenjs`) | `lib/export/pptx.ts` |
| XLSX-Export (`xlsx` → wir nehmen `exceljs`) | `lib/export/xlsx.ts` |
| PDF-Export (`html2pdf` → wir nehmen `puppeteer`) | `lib/export/pdf.ts` |
| Dark-Mode-Tokens (Tailwind-Config) | `tailwind.config.ts` + `globals.css` |

**Nicht portiert:** MSAL/Entra-Auth, CRM-Service, Firebase, Google Custom Search, Mock-Daten-Pfad (außer Fixtures für Tests).

---

## 12. Sicherheit & Datenschutz

- Local-only: keine externen Inferenz-APIs, kein Telemetrie-Versand.
- Externe HTTP-Calls (yfinance/EDGAR/FMP/AV/RSS) timeoutet (15 s), AbortController, kein `eval`.
- API-Keys nur aus `.env`, niemals in Client-Bundle (Server-only Module).
- Input-Validation per Zod auf allen API-Routes (OWASP A03).
- SQL ausschließlich via Drizzle (Prepared Statements, OWASP A03).
- CSP: `default-src 'self'`, kein `unsafe-eval`; Chart.js läuft so.
- Atomare Datei-Writes (`*.tmp` + `rename`) → keine korrupten Reports bei Crash.

---

## 13. Tests

- Unit: Scoring-Blöcke, Gate, Kategorie, JSON-Repair, Schemas (Zod).
- Integration: Provider-Adapter mit Fixture-Responses.
- Contract: LLM-Output gegen Zod-Schema (mit aufgezeichneten Ollama-Responses als Fixtures).
- E2E (Playwright): Run starten → SSE empfangen → Dashboard rendert → Export liefert Datei.
