# MANIFEST.md

> **Pflicht:** Diese Datei ist Single Source of Truth für *was* die App ist, *was* sie darf und *was* sie nicht darf. Jede Änderung an Scope, Datenquellen, Speicherorten oder Modellen muss hier eingetragen werden — **bevor** Code geschrieben wird. PRs/Commits, die das Verhalten ändern, ohne `MANIFEST.md` zu aktualisieren, gelten als unvollständig.

---

## 1. Identität

- **Name:** Kafin Research
- **Typ:** Lokale Web-App für fundamentale Aktien-Research mit lokalem LLM
- **Vorbild (UI/UX):** [1index.html](../1index.html) — Dark-Mode, Glass-Cards, Tab-Navigation, Live-Log, Gauges/Radar, Toasts, Export-Buttons
- **Fachliche Basis:** [research.md](../research.md) — verbindlicher Research-Prozess, Scoring (0–100), Kategorien, Gates, Output-Schema (§21), Agenten-Prompt (§22)
- **Erlaubt:** Research Cards, Scoring, Watchlist, Paper-Research-Ideen, Red-Team-Kritik (Phase 2)
- **Verboten:**
  - Live-Trading, Order-Routing, Broker-Anbindung
  - Halluzinierte Kennzahlen (fehlende Werte → `unknown`, niemals erfinden)
  - Investmentberatung an Dritte
  - Speichern personenbezogener Daten Dritter
  - Bypass der Audit-Logs (jeder LLM-Call wird protokolliert)

---

## 2. Tech-Stack (festgelegt)

| Layer | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) | gemeinsame Sprache FE+BE, Typsicherheit für LLM-Schemas |
| Framework | **Next.js 14 (App Router)** Fullstack | API-Routes + Server Actions + React 18, ein Repo, ein Container |
| Styling | TailwindCSS + CSS-Vars (Dark-Default) | 1:1 portierbar aus `1index.html` |
| Charts | `chart.js` + `react-chartjs-2` (Legacy) + **`recharts`** | recharts für FinancialsChart + ScoreTrendChart; beide Libs aktiv |
| Icons | `@fortawesome/react-fontawesome` (Free) | identisch zum Pilot |
| ORM | **Drizzle ORM** (SQLite-Dialekt, Postgres-ready) | typesafe, migrationsfähig, Pfad zu pgvector offen |
| Datenbank (MVP) | **SQLite** (`data/research.db`) via `better-sqlite3` | lokal, zero-config |
| Validierung | **Zod** | Schemas für LLM-Output (§21 research.md), API-DTOs |
| LLM | **LM Studio** (lokal, `http://localhost:1234`) via OpenAI-kompatible `/v1/*`-Endpoints | Modell-Liste aus `/v1/models`, pro Run/Step wählbar |
| Markt-/Fundamentaldaten | `yahoo-finance2` (npm), SEC EDGAR REST, RSS Parser (`rss-parser`), FMP, Alpha Vantage | Adapter-Pattern, freie Quellen zuerst |
| Sentiment (später) | FinBERT via Ollama oder HF Inference (Phase 2) | optional |
| Export | `pptxgenjs`, `exceljs`, `puppeteer` (PDF) | PPTX wie Pilot, PDF besser via headless Chrome |
| Tests | `vitest` + `@testing-library/react` + `playwright` (E2E) | Standard |
| Lint/Format | `eslint`, `prettier`, `typescript --noEmit` in CI | Standard |
| Logging | `pino` + JSONL-Audit-Log auf Disk | strukturiert, parsebar |
| Container | **Docker Compose**: `app` (Next.js), `worker` (optional, Phase 2) | reproduzierbar |

> **Verboten ohne Manifest-Update:** Wechsel des Frameworks, der DB, der Chart-Lib oder Hinzufügen neuer Cloud-Services.

---

## 3. Storage-Modell (festgelegt, hybrid)

| Pfad | Inhalt | Zweck |
|---|---|---|
| `data/research.db` | SQLite (Drizzle Schema) | Strukturierte Felder, Scores, Watchlist, Run-Metadaten, Suche |
| `data/reports/{TICKER}/{YYYY-MM-DD}_{run_id}.md` | Markdown-Report | Menschenlesbar, Git-/diffable |
| `data/reports/{TICKER}/{YYYY-MM-DD}_{run_id}.json` | JSON nach `research.md` §21 | Maschinenlesbar, Re-Import möglich |
| `data/raw/{TICKER}/{run_id}/` | Rohartefakte: Filings, HTML, LLM-Prompts, LLM-Responses, Quellen-Snapshots | Reproduzierbarkeit, Anti-Halluzination |
| `data/logs/audit.jsonl` | Append-only JSONL: jeder LLM-Call, jeder Datenabruf, jeder Score | Auditfähigkeit |
| `data/logs/app-{YYYY-MM-DD}.log` | App-Logs (pino, JSON-Lines) | Betrieb |
| `data/cache/` | TTL-Cache für externe API-Calls (z. B. yfinance Quotes) | Rate-Limits schonen |

**Naming-Regeln:**
- `run_id` = ULID (sortierbar, zeitbasiert)
- Ticker = uppercase, ohne Suffixe in Pfad; `exchange` als Feld in DB
- Datei-Schreibvorgänge atomar (`*.tmp` → `rename`)

---

## 4. Datenquellen (festgelegt)

| Quelle | Auth | Zweck | Confidence-Klasse (research.md §7) |
|---|---|---|---|
| Yahoo Finance (`yahoo-finance2`) | keine | Kurs, NTM-Multiples, Beta, Shares Outstanding | B |
| SEC EDGAR REST | keine (User-Agent Pflicht) | 10-K, 10-Q, 8-K Metadaten + Volltext-Links | A |
| RSS Feeds (IR-Seiten, SEC, Finanzen) | keine | News, Katalysatoren | C |
| Financial Modeling Prep (FMP) | API-Key (`.env`) | Fundamentaldaten, Ratios, Historie | B |
| Alpha Vantage | API-Key (`.env`) | Backup-Fundamentaldaten, FX | B |
| Finnhub | API-Key (`.env`, `FINNHUB_API_KEY`) | News-Sentiment-Score + Buzz (`news_sentiment`-Capability) | B |

**Adapter-Pattern Pflicht:** Jede Quelle implementiert `interface DataProvider`. Neue Quellen werden hier eingetragen, bevor Adapter geschrieben werden.

---

## 5. LLM-Regeln (LM Studio / DeepSeek / Groq)

- **Drei Provider** wählbar über Einstellungsseite: `lmstudio` (lokal), `deepseek` (Cloud-API, OpenAI-kompatibel), `groq` (Cloud-Inferenz-API, OpenAI-kompatibel).
- Provider-Konfiguration in SQLite `settings`-Tabelle. Schlüssel:
  - `llm_provider` — `"lmstudio"` | `"deepseek"` | `"groq"` (legacy `ollama` wird auf `lmstudio` normalisiert)
  - `deepseek_api_key`, `deepseek_model` (Default `deepseek-chat`)
  - `groq_api_key`, `groq_model` (Default `meta-llama/llama-4-scout-17b-16e-instruct`)
- Lese-Cache 10 s via `src/lib/llm/config.ts`. Settings-Änderungen invalidieren Cache sofort.
- **LM Studio:** Modell-Liste dynamisch via `GET /v1/models`. Default = erstes geeignetes Text-LLM. Modellauswahl **nur in den Einstellungen**, nicht im Run-Dialog.
- **LM Studio Calls:** Chat-Calls gehen gegen `POST /v1/chat/completions`, mit Repair-Retry bei JSON-Parse-Fehlern.
- **DeepSeek:** `response_format: { type: "json_object" }`. API gegen `https://api.deepseek.com`.
- **Groq:** Kein `response_format` (Kompatibilität mit Reasoning-Modellen). API gegen `https://api.groq.com/openai/v1`. Retry/Backoff bei transienten Fehlern; bei HTTP 429 wird der `Retry-After`-Header ausgewertet und exakt so lange gewartet (max 90 s). Section-Concurrency auf 1 begrenzt (TPM-Limit-Schutz).
- **Jeder** LLM-Call schreibt nach `data/logs/audit.jsonl` (`run_id`, `step`, `model`, `prompt_hash`, `prompt_path`, `response_path`, `ms`, `ok`, `error`).
- Temperature default `0.1` für Extraktion, `0.2` für Scoring, `0.4` für Summaries.
- Schema-Validierung via Zod. Bei Fehlschlag: 1× Repair-Retry, dann Run als `failed` — kein Silent-Fallback.

## 6. Phase 6 Erweiterungen

- `score_history` persistiert pro Report den Score-Verlauf mit `deltaFromPrevious` und `trend`.
- Report-JSON enthält zusätzlich `market_context`, `sector_baseline_used`, `combo_flags`, `confidence_score` und `score_trend`.
- Das Report-Dashboard ist decision-first und zeigt Marktregime, Breadth, VIX, High-Yield-Spread, Score-Trend und aktive Combo-Signale.

## 7. Phase 6C Erweiterungen

- Report-JSON enthaelt den Pflichtblock `trade_setup` mit `entry_zone_max`, `stop_ref`, `risk_reward`, `action`, `sizing_hint`.
- Report-UI ist terminal-dicht und zeigt Setup/Regime/Kennzahlen/Ownership/Advisor-Trigger ohne Pflicht-Akkordeons.
- Analyst-Interpretation bleibt optional und ist strikt getrennt von deterministischen numerischen Feldern.
- Trigger- und Zahlen-Guardrails: Analyst-Texte duerfen nur auf Report-nachgewiesene Werte referenzieren.

---

## 8. Scoring (research.md §9–§16)

Deterministisch im **Backend** berechnet, nicht vom LLM. LLM liefert nur Sub-Indikatoren (0–10 pro Metrik mit Begründung + Quelle). Backend gewichtet:

| Block | Gewicht |
|---|---:|
| A. Wachstum & Marktchance | 18 |
| B. Unit Economics & Margen | 14 |
| C. Qualität & Moat | 18 |
| D. Bewertung relativ zu Wachstum | 14 |
| E. Kapitaldisziplin & Verwässerung | 12 |
| F. Katalysatoren, Revisionen, Sentiment | 8 |
| G. Ownership & Smart Money | 8 |
| H. Risiko & Fragilität | 8 |
| **Summe** | **100** |

Gate-Logik & Blocker exakt nach `research.md` §18–§20. Hard-Blocker setzen Gate = `Red` unabhängig vom Score.

Zusätzliche Invarianten (Trust Layer v2):
- **Applicability-first:** Nicht anwendbare Metriken (z. B. Rule of 40 außerhalb SaaS/Cloud-Profilen) werden aus Coverage-/Signal-Gating ausgeschlossen.
- **Output-Hygiene:** UI-Red-Flags und Hard-Blockers werden vor Persistenz sanitisiert (keine Sentinel-/QA-Telemetrie, keine Nicht-Events, dedupliziert).
- **Deterministische Schutzregeln:** Ausgewählte Indikatoren werden regelbasiert überschrieben, wenn LLM-Score und messbare Kennzahl konfligieren.
- **Confidence-Caps:** Kritische Datenlücken, unsupported Claims oder Konflikte kappen die Confidence deterministisch.
- **Score nullable:** Bei zu niedriger kritischer Datenabdeckung darf der Gesamtscore `null` sein; Gate wird dann konservativ `Red`.
- **Model-Trail verpflichtend:** Pro LLM-Step werden `provider`, `requestedModel`, `effectiveModel` und verfügbare Token-/Rate-Limit-Metadaten persistiert.

---

## 9. MVP-Scope (festgelegt)

In dieser Reihenfolge:
1. Ticker-Eingabe → Research-Run (Daten-Fetch → LLM-Extraktion → Scoring → Speicherung)
2. Audit-Dashboard (Gauges, Radar, 16 KPI-Cards, ISIN, Score-Breakdown, Source-Liste, dichte Darstellung)
3. Watchlist + Reports-Liste + Versionsvergleich (Diff zweier Runs)
4. Live-Log-Panel (Server-Sent Events, Style aus Pilot)
5. Export: PDF (puppeteer), XLSX (exceljs), Audit-JSON (vollständiger Audit-Kontext) — alle drei in einem Dropdown. PPTX-Route technisch vorhanden, im UI nicht exponiert.

**Explizit nicht im MVP:** Red-Team, RSS-Sentiment-Pipeline, Paper-Trading-Gate, Entra-Auth, Multi-User, CRM.

---

## 10. Pflichten zur Dokumentations-Pflege

Diese vier Dateien sind **zwingend** zu pflegen:

| Datei | Wer aktualisiert | Wann |
|---|---|---|
| [MANIFEST.md](MANIFEST.md) | Maintainer | Bei jeder Scope-/Stack-/Quellen-Änderung — vor Implementation |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Maintainer | Bei jeder strukturellen Änderung (Module, Datenfluss, Schemas) |
| [AGENT.md](AGENT.md) | Maintainer + jeder, der LLM-Prompts ändert | Bei jeder Prompt-/Modell-/Regelanpassung |
| [STATUS.md](STATUS.md) | Jeder Commit, der Features bewegt | Pro Arbeitssession |
| [FUTURE.md](FUTURE.md) | Maintainer | Wenn Entscheidungen verschoben werden; **gestrichener Eintrag** wandert in die passende Doku |

> Ein Feature gilt erst als „fertig", wenn Code + Tests + diese fünf Dateien synchron sind.
