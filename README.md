# Kafin Research

Lokale Web-App fuer deterministische Aktien-Research mit auditierbarem Datenpfad, LLM-Interpretation als optionalem Zusatz-Layer und trader-orientierter Report-Ansicht.

Scope: Research und Entscheidungsunterstuetzung, kein Live-Trading, keine Broker-Anbindung.
Verbindliche Produktgrenzen stehen in [docs/MANIFEST.md](docs/MANIFEST.md).

---

## Kernprinzipien

- Deterministische Numerik zuerst: Kennzahlen, Score, Gate, Fair Value, Trade Setup kommen aus TypeScript-Logik.
- LLM als Interpret, nicht als Rechner: Analyst-Texte sind getrennt und duerfen numerische Felder nicht veraendern.
- Reproduzierbarkeit und Audit: Rohartefakte, Logs, Report-JSON und Version-Metadaten werden persistiert.
- Resilienz bei Datenabruf: Capability-Status, Retry/Backoff und Run-Integrity-Banner sind Teil des Reports.
- Domain-Routing fuer Ergebnisqualitaet: fundamental, qualitative, data_incomplete.

---

## Features

- Deterministische Scoring-Engine mit 8 Block-Dimensionen und Gate-Logik.
- Timing/Regime-Achse, Fair-Value-Berechnung und deterministisches Trade-Setup.
- Optionaler KI-Analyst mit Guardrails (kein Score-Override, keine frei erfundenen Zahlen).
- Dense Trader-Terminal auf [src/app/reports/[id]/page.tsx](src/app/reports/[id]/page.tsx):
  - Statuszeile
  - Trade-Setup / Verdikt / Markt-Regime
  - immer sichtbare Kennzahlen und Momentum-Zeile
  - Mini-Charts, Ownership/Smart-Money, Advisor-Trigger
- Watchlist, Reports-Liste, Vergleichsansicht, Exporte (PDF/XLSX/JSON).
- Live-Run-Events via SSE.
- Report-Chat-Availability-Checks ohne 405-Rauschen (GET/OPTIONS auf Report-Chat-Route).

---

## Tech Stack

- Next.js 14 App Router, React 18, TypeScript strict
- TailwindCSS
- Drizzle ORM + better-sqlite3 (SQLite)
- Zod
- LLM Router fuer LM Studio, DeepSeek, Groq
- Vitest + Playwright

Details und verbindliche Entscheidungen: [docs/MANIFEST.md](docs/MANIFEST.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Quickstart

### Voraussetzungen

- Node.js >= 20.11
- LM Studio lokal erreichbar (Default: http://localhost:1234)
- Optional: DeepSeek/Groq API-Keys ueber Settings-UI

### Setup

```powershell
git clone https://github.com/Kazuo3o447/KAFIN.git
cd KAFIN
npm install
copy .env.example .env
npm run db:migrate
npm run dev
```

App: http://localhost:3000

### Wichtige Scripts

- npm run dev
- npm run build
- npm start
- npm run typecheck
- npm test
- npm run test:e2e
- npm run db:generate
- npm run db:migrate

---

## Wichtige Routen

- /
- /run/[ticker]
- /reports
- /reports/[id]
- /reports/compare/[a]/[b]
- /watchlist
- /logs
- /settings

API (Auszug):
- /api/runs
- /api/runs/[id]/stream
- /api/reports/[id]/export/{pdf,xlsx,json,pptx}
- /api/watchlist
- /api/ollama/models
- /api/settings
- /api/settings/test-llm
- /api/health
- /api/market/health
- /api/market/analyze

---

## Datenablage

Unter data/: 
- research.db
- reports/{TICKER}/*.md + *.json
- raw/{TICKER}/{runId}/
- logs/audit.jsonl
- logs/runs.jsonl

---

## Dokumentation

- [docs/MANIFEST.md](docs/MANIFEST.md): Scope, Regeln, Grenzen
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): Module, Datenfluss, Persistenz
- [docs/AGENT.md](docs/AGENT.md): LLM-Verhalten, Guardrails, Prompt-Regeln
- [docs/STATUS.md](docs/STATUS.md): Session-Log und aktueller Stand
- [docs/FUTURE.md](docs/FUTURE.md): bewusst verschobene Entscheidungen
- [research.md](research.md): fachliche Spezifikation

---

## Hinweis

Keine Anlageberatung. Ergebnisse sind als Research-Artefakte mit Quellen- und Qualitaetskontext zu verstehen.
