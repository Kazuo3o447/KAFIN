# Kafin Research

Lokale Web-App für fundamentale Aktien-Research mit lokalem LLM (Ollama).
Generiert reproduzierbare Research-Reports nach dem in [research.md](research.md)
festgelegten 7-Block-Scoring-Prozess (0–100 Punkte, Gates Green/Yellow/Red).

> **Scope:** Research & Scoring, **kein Live-Trading**, keine Broker-Anbindung.
> Siehe [docs/MANIFEST.md](docs/MANIFEST.md) für die verbindliche Scope-Definition.

---

## Features

- **7-Block-Scoring-Pipeline** (Growth/Market · Unit-Economics · Quality/Moat · Valuation · Capital Discipline · Catalysts · Risk) mit deterministischem Gate/Category-Mapping.
- **Lokales LLM via Ollama** für Faktenextraktion, Block-Bewertung und Thesen-Generierung. Modell pro Step wählbar (`/api/ollama/models`).
- **Provider-Layer**: Yahoo Finance, SEC EDGAR, RSS, FMP, Alpha Vantage. Adapter-Pattern, Throttle pro Host, Raw-Artefakte für Reproduzierbarkeit.
- **Live-Run-UI** mit Server-Sent Events (Progress, Step-Logs, Errors).
- **Audit-Dashboard** pro Report: Gauge, 7-Block-Radar, KPI-Karten, Block-Detail mit Indikator-Begründungen + Quellen-Refs, Hard Blockers.
- **Versionsvergleich**: Score-Δ, 7-Block-Δ, Top-30 Indikator-Δs, Key-Metrics inkl. % Δ, Listen-Diff (Bull/Bear/Catalysts/RedFlags), Thesis vorher/nachher.
- **Exporte**: PDF (Puppeteer), XLSX (ExcelJS), PPTX (PptxGenJS).
- **Watchlist** mit Pin/Unpin und inline editierbaren Notizen.
- **Logs-Seite** mit Auto-Refresh und ERROR/WARN/SUCCESS-Filtern.
- **Linke Sidebar-Navigation**, Dark-Mode-Default, Print-CSS für PDF-Export.

---

## Tech-Stack

TypeScript (strict) · Next.js 14 App Router · React 18 · TailwindCSS 3 ·
Drizzle ORM + better-sqlite3 · Zod · Ollama · yahoo-finance2 · Chart.js ·
ExcelJS · PptxGenJS · Puppeteer · Vitest · Playwright.

Versionen sind in [package.json](package.json) gepinnt. Begründungen
in [docs/MANIFEST.md §2](docs/MANIFEST.md).

---

## Quickstart

### Voraussetzungen
- Node.js ≥ 20.11
- Ollama lokal (`http://localhost:11434`) mit ≥ 1 geladenem Modell
- Optional: FMP- und/oder Alpha-Vantage-API-Key in `.env`

### Setup

```powershell
git clone https://github.com/Kazuo3o447/KAFIN.git
cd KAFIN
npm install
copy .env.example .env       # API-Keys ergänzen (optional)
npm run db:migrate           # SQLite-Schema anlegen
npm run dev                  # http://localhost:3000
```

### Skripte

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Next-Dev-Server (Port 3000) |
| `npm run build` | Production-Build |
| `npm start` | Production-Server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest Unit-Tests |
| `npm run test:e2e` | Playwright Smoke (8 Tests) |
| `npm run test:e2e:install` | Playwright-Browser (Chromium) |
| `npm run db:generate` | Drizzle-Migration generieren |
| `npm run db:migrate` | Migration anwenden |

### Docker

```powershell
docker compose up -d
```

Ollama läuft auf dem Host (siehe [docs/STATUS.md](docs/STATUS.md) — „Offene
Entscheidungen"), die App spricht via `http://host.docker.internal:11434`.

---

## Routen

| Pfad | Zweck |
|---|---|
| `/` | Start: Ticker eingeben, Modelle wählen, Run starten |
| `/run/[ticker]` | Live-Run mit SSE-Progress |
| `/reports` | Reports-Liste mit „vs. Vorgänger"-Button |
| `/reports/[id]` | Audit-Dashboard inkl. Pin- und Export-Buttons |
| `/reports/compare/[a]/[b]` | Versionsvergleich |
| `/watchlist` | Gepinnte Tickers, Notes editierbar |
| `/logs` | Server-Logs (Auto-Refresh) |
| `/settings` | App- und Modell-Defaults |

API-Routen: `/api/runs`, `/api/runs/[id]/stream` (SSE), `/api/reports/[id]/export/{pdf,xlsx,pptx}`, `/api/watchlist`, `/api/ollama/models`, `/api/health`.

---

## Verzeichnisstruktur (verkürzt)

```
src/
  app/                 Next App Router (Pages + API)
  components/          GlassCard, Gauge, RadarChart, KpiCard,
                       AuditTabs, LogPanel, SourceList, ExportButtons,
                       PinButton, WatchlistRowActions, Toast, …
  lib/
    diff/              Report-Diff (Score-Δ, Block-Δ, Listen-Δ)
    export/            PDF/XLSX/PPTX-Generierung
    llm/               Ollama-Client + Prompts
    orchestrator/      7-Step-Pipeline + SSE-Event-Bus
    providers/         Yahoo · EDGAR · RSS · FMP · AlphaVantage
    schemas/           Zod-Schemas (Report, KeyMetrics, BlockAudit, …)
    scoring/           Weights · Score · Gate
    storage/           Drizzle Schema + Migrations
tests/
  unit/                Vitest (23 Tests)
  e2e/                 Playwright (8 Tests)
data/                  SQLite-DB + Reports + Raw-Artefakte (lokal, nicht im Repo)
docs/                  MANIFEST · ARCHITECTURE · AGENT · STATUS · FUTURE
```

---

## Datenfluss (verkürzt)

```
Ticker → fetchBaseData (Provider parallel)
       → buildContext  (Quellen-Map + Fakten)
       → extractFacts  (LLM: Identity + KeyMetrics)
       → answerSections (LLM: 7 Blöcke parallel, max 2)
       → computeScoreAndGate (deterministisch)
       → summarize     (LLM: Thesis/Bull/Bear/Catalysts)
       → persist       (atomic write MD + JSON + DB)
```

Vollständige Architektur in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Dokumentation

| Datei | Inhalt |
|---|---|
| [docs/MANIFEST.md](docs/MANIFEST.md) | Scope, Stack-Festlegung, Verboten-Liste, Storage, Datenquellen |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layer, Pipeline-Steps, DB-Schema, SSE-Bus |
| [docs/AGENT.md](docs/AGENT.md) | Prompts, Modell-Defaults, Temperaturen, JSON-Schemas |
| [docs/STATUS.md](docs/STATUS.md) | Logbuch: aktueller Stand, nächste Schritte, Changelog |
| [docs/FUTURE.md](docs/FUTURE.md) | Verschobene Entscheidungen (mit Trigger) |
| [research.md](research.md) | Fachliche Basis: Research-Prozess, Scoring, Output-Schema §21 |

---

## Lizenz

Privates Projekt. Keine Garantie auf Korrektheit der generierten Inhalte —
**keine Anlageberatung**.
