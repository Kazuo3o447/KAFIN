# STATUS.md

> **Pflicht:** Diese Datei wird **pro Arbeitssession** aktualisiert. Sie ist das Logbuch des Projekts: aktueller Stand, nächste Schritte, offene Entscheidungen, bekannte Probleme. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

---

## Aktueller Stand — 2026-05-22 (Update 10)

**Phase:** F — Fair-Value-Engine, Verdict-Generator, Decision-First Audit-Dashboard, XLSX-Export-Erweiterung.

### Vorhanden (zusätzlich zu Update 9)

#### F.1 — Deterministischer Fair-Value-Engine
- **`src/lib/research/fair-value.ts`** (NEU): Multi-Methoden Fair-Value-Engine. 3 Methoden: EV/Sales, EV/Gross-Profit, Forward P/E. Gewichteter Median mit Konfidenz-Gewichten. Klassifizierung: `deep_value | value | fair | premium | overvalued`. Skala ±50 % (off-scale bei Überschreitung). Währungs-Mismatch → Confidence forced `low`. Peer-Bucket-Integration.
- **`tests/unit/fair-value.test.ts`** (NEU): 15 Tests — alle grün.

#### F.2 — Verdict-Generator
- **`src/lib/research/verdict.ts`** (NEU): Deterministischer Verdict-Label (Hard-Blocker > Gate-Red > Gate-Yellow > Gate-Green-Kombinationen). `buildVerdict()`, `sanitizeVerdictDetail()`, `blockerToBlock()`. FORBIDDEN_WORDS-Filter (kein Buy/Sell/Hold).
- **`src/lib/llm/prompts.ts`** (GEÄNDERT): `VERDICT_DETAIL_SYSTEM` + `VERDICT_DETAIL_USER` — 25-Wort-Limit, keine Kurs-Empfehlung.
- **`tests/unit/verdict.test.ts`** (NEU): 20 Tests — alle grün.

#### F.3 — Schema & Pipeline-Integration
- **`src/lib/schemas/report.ts`** (GEÄNDERT): `ReportSchema` um `fair_value` und `verdict` erweitert — beide `nullable().default(null)` (abwärtskompatibel).
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): `stepComputeFairValue()`, `stepGenerateVerdict()` hinzugefügt. `stepPersist()` schreibt neue Felder.
- **`src/lib/orchestrator/pipeline.ts`** (GEÄNDERT): `POST_STEPS`-Reihenfolge: score → peer (75 %) → fair_value (78 %) → summary (86 %) → redteam (92 %) → verdict (96 %) → persist (100 %).
- **`tests/unit/schema-backcompat-fairvalue.test.ts`** (NEU): 3 Tests — alte Reports ohne `fair_value`/`verdict` parsen ohne Fehler.

#### F.4 — Decision-First Audit-Dashboard
- **`src/components/FairValuePanel.tsx`** (NEU): 3-Zonen-Skalierungsbalken, Fair-Value-Marker, Methoden-Tabelle, Reverse-DCF-Annotation.
- **`src/components/DecisionHero.tsx`** (NEU): Verdict-Hero links, FairValuePanel rechts, 2-Spalten-Grid auf md+.
- **`src/components/CollapsibleSection.tsx`** (NEU): Expand/Collapse-Sektionen, Print-Mode immer geöffnet.
- **`src/components/BlockOverviewBars.tsx`** (NEU): Horizontale Block-Bars mit Auto-Expand-Logik (Hard-Blocker-Block → schwächster Block → null). Exportiert `findAutoExpandBlock()`.
- **`src/components/ScoreKpiStrip.tsx`** (NEU): Mini-Gauge + 8 KPI-Tiles, Modell-spezifische Layouts (`KPI_LAYOUTS`), Peer-Perzentil-Pfeile. Exportiert `KPI_LAYOUTS`, `DEFAULT_KPI_LAYOUT`.
- **`src/app/reports/[id]/page.tsx`** (VOLLSTÄNDIG ÜBERARBEITET): Decision-First-Layout. Container `max-w-5xl`. Alte Komponenten (Gauge, RadarChart, KpiCard, AuditTabsClient) entfernt.
- **`src/styles/globals.css`** (GEÄNDERT): Print-Mode-Regeln — Sidebar/Buttons versteckt, collapsible-content always-open, break-inside-avoid.
- **Entfernt:** `src/components/AuditTabs.tsx`, `src/components/RadarChart.tsx`, `src/components/KpiCard.tsx`, `src/app/reports/[id]/AuditTabsClient.tsx`.
- **`tests/unit/kpi-layout.test.ts`** (NEU): 6 Tests — SaaS enthält NRR, Semiconductor enthält Net Debt/EBITDA.
- **`tests/unit/block-auto-expand.test.ts`** (NEU): 5 Tests — Auto-Expand-Logik.

#### F.5 — XLSX-Export-Erweiterung
- **`src/lib/export/xlsx.ts`** (GEÄNDERT): Neue Sheets „Fair Value" (Methoden-Rows, Reverse-DCF, Summary) und „Verdict" (Label, Detail) — nur wenn Felder im Report vorhanden.
- **`tests/unit/export-xlsx.test.ts`** (NEU): 4 Tests — Fair-Value-Sheet bei FV-Daten, Verdict-Sheet bei Verdict-Daten, keine Sheets ohne Daten.

### Behobene Bugs
| Bug | Ursache | Fix |
|---|---|---|
| page.tsx doppelter Code nach Rewrite | Partielle Replace-Operation lies alte Funktion als Anhang | PS .NET File-API zum präzisen Truncate |
| Typecheck-Fehler in xlsx.ts | Falsche Feldnamen (`method`, `estimate`, `implied_growth_rate`) statt Schema-Namen (`name`, `value`, `implied_fcf_cagr`) | Korrigiert |

### Verifiziert (Update 10)
- `npm run typecheck` ✅ (exit 0)
- `npx vitest run` ✅ 106/106 Tests in 14 Test-Dateien

---

## Aktueller Stand — 2026-05-22 (Update 9)

**Phase:** 5 — OpenRouter-Provider, ISIN-Integration, dichteres Audit-Dashboard, Export-Refactor.

### Vorhanden (zusätzlich zu Update 8)

#### OpenRouter-Provider (Ersatz für DeepSeek als bevorzugter Cloud-Provider)
- **`src/lib/llm/openrouter.ts`** (NEU): OpenAI-kompatibler Client gegen `https://openrouter.ai/api/v1`. Retry/Backoff bei transienten HTTP-Fehlern und Netzwerk-Timeouts, `AbortSignal.timeout` für harten Cutoff, Fallback-Modell-Kandidaten-Chain (`openrouter/free` → `google/gemma-4-31b-it:free` → `openrouter/auto`), Audit-Log schreibt verwendetes Modell.
- **`src/lib/llm/config.ts`** (GEÄNDERT): `LLMConfig` um `openrouterApiKey` und `openrouterModel` (Default `openrouter/free`) erweitert.
- **`src/lib/llm/ollama.ts`** (GEÄNDERT): `chatJSON()` routet jetzt dreifach: `openrouter` → `deepseek` → `ollama`.
- **`src/app/api/settings/test-llm/route.ts`** (GEÄNDERT): Unterstützt OpenRouter-Konnektivitätstest (1-Token-Call mit `openrouter/free`-Fallback).
- **`src/app/settings/page.tsx`** (GEÄNDERT): Dritter Provider-Tab „OpenRouter", API-Key-Eingabe + Modellfeld, „Verbindung testen"-Button.
- **`src/app/page.tsx`** (GEÄNDERT): Provider-Status-Banner erkennt jetzt auch `openrouter`; kein Ollama-Modell-Override bei OpenRouter.

#### Pipeline-Stabilisierung
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): Section-Concurrency: `deepseek`=7, `ollama`/`openrouter`=1 (stabilere Verarbeitung für externe Free-Tier-APIs).
- **`src/app/api/runs/[id]/stream/route.ts`** (GEÄNDERT): SSE-Cleanup konsequent bei `done`/`error`/`cancel`/`abort` — verhindert Listener-Leaks bei Reconnects.
- **`src/lib/orchestrator/events.ts`** (GEÄNDERT): Max-Listener auf unbegrenzt (`0`) gesetzt, verhindert `MaxListenersExceededWarning` unter Last.

#### ISIN-Feld (Ende-zu-Ende)
- **`src/lib/schemas/report.ts`** (GEÄNDERT): `ReportSchema` um `isin: z.string().default("")` erweitert. Abwärtskompatibel (Default leer).
- **`src/lib/llm/prompts.ts`** (GEÄNDERT): Extractor-Prompt fordert `"isin": string|null` explizit an.
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): `ExtractorOutput`-Interface um `isin` ergänzt. Neue Hilfsfunktionen `normalizeIsin()` (ISIN-Format-Validierung) und `extractIsinFromFacts()` (Regex-Fallback aus Provider-Fakten). ISIN wird in `state.identity` und in `reportData` persistiert.
- **`src/app/reports/[id]/page.tsx`** (GEÄNDERT): ISIN wird im Audit-Dashboard-Header unter Ticker/Company sichtbar angezeigt.

#### Dichteres Audit-Dashboard-Layout
- **`src/app/reports/[id]/page.tsx`** (GEÄNDERT):
  - Container `max-w-6xl` → `max-w-[92rem]`, Innenabstände reduziert (`px-3 sm:px-4 lg:px-5`).
  - Hero-Bereich als 12-Spalten-Grid: Identität/Badges (6 Spalten) · Gauge (3 Spalten) · Quick-KPIs (3 Spalten).
  - KPI-Sektion: 8 → 16 Kennzahlen (neu: Operating Margin, ROIC, Rule of X, Share Growth YoY, SBC/Revenue, Net Debt/EBITDA, EV/Gross Profit, Beta).
  - Radar-Karte nimmt 4 von 12 Spalten, KPI-Grid 8/12.
  - Card-Padding durchgängig `p-4` statt `p-5` für mehr Inhaltsdichte.
- **`src/lib/export/pdf.ts`** (GEÄNDERT): PDF-Seitenränder von `16mm/12mm` auf `10mm/6mm` reduziert.

#### Export-Refactor
- **`src/components/ExportButtons.tsx`** (GEÄNDERT): Drei Einzel-Buttons → einzelnes Dropdown-Menü. Formate: Excel · JSON · PDF (PPTX-Schaltfläche entfernt).
- **`src/app/api/reports/[id]/export/json/route.ts`** (NEU): Vollständiger Audit-JSON-Export — enthält Report-JSON, Metadaten (inkl. verwendete Modelle), gefilterte Run-Events aus `runs.jsonl`, LLM-Audit-Calls aus `audit.jsonl` und Prompt/Response-Artefakte aus `data/raw`. Dateiname: `{TICKER}_{DATUM}_audit.json`.

### Behobene Bugs
| Bug | Ursache | Fix |
|---|---|---|
| SSE-Listener-Leak bei Reconnect | Cleanup fehlte bei `cancel`/`abort`-Pfad | Cleanup in allen Exit-Pfaden |
| `MaxListenersExceededWarning` | EventEmitter-Default-Limit (10) bei vielen Reconnects | Max-Listener auf 0 (unbegrenzt) |
| Provider-Fehler bei OpenRouter Free-Tier | Transiente 5xx + Netzwerk-Timeouts | Retry/Backoff + `AbortSignal.timeout` + Fallback-Chain |

### Verifiziert (Update 9)
- `npm run typecheck` ✅ (exit 0)
- JSON-Export-Endpoint HTTP 200 (Smoke-Test) ✅

---

## Aktueller Stand — 2026-05-22 (Update 8)

**Phase:** 4 — DeepSeek-Integration, LLM-Provider-Umschalter, Pipeline-Fixes, Performance-Optimierungen.

### Vorhanden (zusätzlich zu Update 7)

#### LLM-Provider-Schicht
- **`src/lib/llm/config.ts`** (NEU): Liest Provider-Konfiguration aus SQLite `settings`-Tabelle (10 s-Cache). Typ `LLMConfig` = `{ provider: "ollama"|"deepseek"; deepseekApiKey; deepseekModel }`. Schlüssel: `llm_provider`, `deepseek_api_key`, `deepseek_model`.
- **`src/lib/llm/deepseek.ts`** (NEU): OpenAI-kompatibler DeepSeek-API-Client (`https://api.deepseek.com`), gleiche `ChatJSONOptions`-Schnittstelle wie Ollama, JSON-Repair-Retry, Audit-Log.
- **`src/lib/llm/ollama.ts`** (GEÄNDERT): `chatJSON()` routet jetzt via `getLLMConfig()` zu DeepSeek oder Ollama. Ollama-Calls verwenden nun **`stream: true`** (Token-Streaming) statt `stream: false` — behebt den undici `headersTimeout`-Crash nach 300 s bei großen Modellen.

#### Settings-API
- **`src/app/api/settings/route.ts`** (NEU): `GET /api/settings` (alle oder per `?key=`), `POST /api/settings` (upsert). Invalidiert LLM-Config-Cache bei `llm_*`/`deepseek_*`-Keys automatisch.
- **`src/app/api/settings/test-llm/route.ts`** (NEU): `GET /api/settings/test-llm` → `{ ok, message }`. Testet DeepSeek (1-Token-Chat mit 15 s AbortSignal) oder Ollama (`/api/tags` mit 5 s AbortSignal).

#### Einstellungsseite
- **`src/app/settings/page.tsx`** (VOLLSTÄNDIG ÜBERARBEITET): Provider-Toggle (Ollama / DeepSeek), Ollama-Sektion mit ModelSelector + Base-URL-Input, DeepSeek-Sektion mit API-Key-Input (show/hide) + Modell-Name. „Speichern" + „Verbindung testen" nebeneinander. Testergebnis als farbiger Block (grün ✓ / rot ✗).

#### Startseite
- **`src/app/page.tsx`** (GEÄNDERT): ModelSelector **entfernt** — Modellauswahl ausschließlich über Einstellungen. Provider-Status-Banner (lädt Provider aus API, testet Verbindung beim Start). Rotes Error-Banner bei nicht erreichbarem Provider mit Link zu Einstellungen.

#### Logs-Seite
- **`src/app/logs/page.tsx`** (VOLLSTÄNDIG ÜBERARBEITET): Server-Component mit `force-dynamic`. Liest `data/logs/runs.jsonl` (letzte 300) und `data/logs/audit.jsonl` (letzte 100). Zwei Sektionen: Pipeline-Logs (Zeitstempel, Level-Badge, runId, Message) und LLM-Audit-Tabelle (Zeit, Run, Step, Modell, Dauer, OK, Fehler).

#### Orchestrator-Fixes
- **`src/lib/orchestrator/events.ts`** (GEÄNDERT): `bus`-Map an `globalThis.__kafinRunBus` gehängt — behebt fehlende SSE-Events in Next.js-Dev-Mode (separate Modul-Instanzen pro Route). Schreibt Pipeline-Logs zusätzlich in `data/logs/runs.jsonl`.
- **`src/lib/orchestrator/pipeline.ts`** (GEÄNDERT): Gesamte `runPipeline()`-Funktion in try/catch eingewickelt (frühzeitige Fehler wie „Ollama nicht erreichbar" werden als SSE-Error-Event gesendet). **Extract + Sections laufen jetzt parallel** (Phase-2-Block mit `Promise.all`).
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): `resolveModels()` beachtet `getLLMConfig()`; bei DeepSeek wird `deepseek_model` aus DB genutzt. Section-Concurrency von 2 auf **7** erhöht.

#### Performance-Optimierungen
- **`src/lib/research/context.ts`** (GEÄNDERT): Global-Context 32 K → 18 K Zeichen, Block-Context 22 K → 12 K Zeichen. Schnellerer LLM-Prefill.
- **`src/lib/llm/prompts.ts`** (GEÄNDERT): Rationale-Limit von „max 2 Sätze" auf **max 10 Wörter** reduziert → ~35 % weniger Output-Tokens pro Section-Call.

### Behobene Bugs
| Bug | Ursache | Fix |
|---|---|---|
| „Warte auf Start" (keine SSE-Events) | Next.js Dev-Mode: jede Route bekommt eigene Modul-Instanz → `bus`-Map nicht geteilt | `globalThis.__kafinRunBus` |
| „fetch failed" nach ~305 s (Ollama) | undici `headersTimeout: 300 s` + Ollama `stream: false` → erste Headers kamen erst nach vollständiger Generierung | Ollama auf `stream: true` umgestellt |
| Pipeline-Fehler ohne UI-Feedback | `resolveModels()` außerhalb try/catch → silent crash | Gesamte Pipeline-Funktion im try/catch |
| Logs-Seite leer | `runs.jsonl` existierte nicht; `audit.jsonl`-Format passte nicht zur alten Anzeige | Logs-Seite neu geschrieben; `logRun()` schreibt in `runs.jsonl` |

### Geschätzte Performance-Verbesserung (nächster Run)
- **–50 % Gesamtzeit** durch paralleles Extract+Sections
- **–30 % Prefill** durch kleineren Context
- **–35 % Output-Tokens** durch kürzere Rationale

### Verifiziert (Update 8)
- `npx tsc --noEmit` ✅ (exit 0)

---

## Aktueller Stand — 2026-05-20 (Update 7)

**Phase:** 3.5 — Versionsvergleich, Watchlist-Notes editierbar, Reports-Liste mit Compare-Button.

### Vorhanden (zusätzlich zu Update 6)
- **Report-Diff-Library** [src/lib/diff/report-diff.ts](../src/lib/diff/report-diff.ts):
  - `diffReports(a, b)` liefert `ReportDiff` mit Score-Δ, Block-Δ (7 Blöcke), Key-Metrics-Δ inkl. % Δ, List-Δs (added/removed/unchanged) für Bull/Bear/Catalysts/RedFlags/HardBlockers/OpenQuestions, sortierte Indikator-Δs und Thesis-Vergleich.
- **Compare-Page** [src/app/reports/compare/[a]/[b]/page.tsx](../src/app/reports/compare/[a]/[b]/page.tsx):
  - Server-Component lädt beide Reports, auto-sortiert (älter → neuer) per `createdAt`, lehnt Ticker-Mismatch ab (404).
  - UI: Hero (Score / Gate / Kategorie / Confidence mit Δ-Marker), 7-Block-Tabelle, Indikator-Δ-Liste (Top-30 nach |Δ|), Key-Metrics-Tabelle mit absolutem + %-Δ, 6 Listen-Δ-Karten, These vorher/nachher.
- **Reports-Liste** [src/app/reports/page.tsx](../src/app/reports/page.tsx): chronologische Vorgänger-Erkennung je Ticker; bei vorhandenem Vorgänger zusätzlicher Button **vs. Vorgänger** → führt zu Compare-Page.
- **Watchlist-Notes editierbar** [src/components/WatchlistRowActions.tsx](../src/components/WatchlistRowActions.tsx): Inline-Edit (500-Zeichen-Limit) ruft `POST /api/watchlist` upsert; **Unpin** mit Bestätigungs-Dialog, `router.refresh()` nach Mutation.
- **Unit-Test** [tests/unit/report-diff.test.ts](../tests/unit/report-diff.test.ts) mit 5 deterministischen Tests (Score-Δ, Block-Δ, List-Diff, Indikator-Sortierung, pctDelta).

### Verifiziert (Update 7)
- `npm run typecheck` ✅
- `npm test` ✅ 23/23 Unit (4 neu für `report-diff`)
- `npm run test:e2e` ✅ 8/8 E2E
- `npm run build` ✅ 18 Routen (neu: `/reports/compare/[a]/[b]`)

---

## Aktueller Stand — 2026-05-20 (Update 6)

**Phase:** 3 — Sidebar-Refactor + Watchlist-API + Score-Indikator-Persistenz + E2E-Smoke.

### Vorhanden (zusätzlich zu Update 5)
- **Sidebar-Shell** in [layout.tsx](../src/app/layout.tsx): Navigation an den linken Rand verschoben, ohne Symbole/Emojis (textonly: Start, Reports, Watchlist, Logs, Einstellungen). Print-CSS blendet Sidebar aus, Hauptinhalt nutzt `.app-main` mit `margin-left: 220px`. Mobile (≤768px): Sidebar collapsed auf 64px. Styles in [globals.css](../src/styles/globals.css).
- **Watchlist-API** in [src/app/api/watchlist/route.ts](../src/app/api/watchlist/route.ts):
  - `GET /api/watchlist` → alle Pins
  - `POST /api/watchlist` → upsert `{ ticker, notes?, lastReportId? }`
  - `DELETE /api/watchlist?ticker=X` → unpin
  - Ticker-Validierung: `/^[A-Z0-9.\-]+$/`, max 16 Zeichen.
- **PinButton** in [src/components/PinButton.tsx](../src/components/PinButton.tsx) im Audit-Dashboard, zeigt Pin-State + toggelt via API.
- **Score-Indikator-Persistenz:**
  - [report.ts](../src/lib/schemas/report.ts) erweitert um `BlockAuditSchema` + `block_audits: BlockAudit[]`. Felder pro Indikator: `name`, `score`, `rationale`, `sourceIdx[]`. Pro Block: `confidence`, `hard_blockers[]`. Default `[]` ⇒ abwärtskompatibel mit alten Reports.
  - [steps.ts](../src/lib/orchestrator/steps.ts) `stepPersist` befüllt `block_audits` aus `state.blockResults`.
  - [AuditTabsClient.tsx](../src/app/reports/[id]/AuditTabsClient.tsx) zeigt Indikator-Liste mit Score, Rationale, Quellen-Refs und Hard Blockers je Block.
- **Playwright E2E** in [tests/e2e/smoke.spec.ts](../tests/e2e/smoke.spec.ts) + [playwright.config.ts](../playwright.config.ts): 8 Tests (5 Page-Smokes, 3 Watchlist-API). `npm run test:e2e`.

### Verifiziert (Update 6)
- `npm run typecheck` ✅
- `npm test` ✅ 18/18 Unit
- `npm run test:e2e` ✅ 8/8 E2E (Chromium)

---

## Aktueller Stand — 2026-05-20 (Update 5)

**Phase:** 2.5 — Export-Layer komplett.

### Vorhanden (zusätzlich zu Update 4)
- **Export-Module** in [src/lib/export/](../src/lib/export/):
  - `loader.ts` — lädt Report aus DB + JSON, validiert via Zod
  - `pdf.ts` — Puppeteer rendert `/reports/[id]?print=1` (A4, 1280×1800 viewport, 600 ms Render-Wait für Charts)
  - `xlsx.ts` — ExcelJS Workbook mit 5 Sheets (Overview / Narrative / KeyMetrics / Scoring / Sources)
  - `pptx.ts` — PptxGenJS 5-Slide-Deck (Cover / Score-Breakdown / Bull&Bear / Catalysts&Risks / Quellen) im Kafin-Dark-Master
- **API-Routen** in [src/app/api/reports/[id]/export/](../src/app/api/reports/[id]/export/):
  - `GET /api/reports/[id]/export/pdf`
  - `GET /api/reports/[id]/export/xlsx`
  - `GET /api/reports/[id]/export/pptx`
- **UI:** [ExportButtons](../src/components/ExportButtons.tsx) im Audit-Dashboard (versteckt bei `?print=1`).
- **Print-CSS:** `@media print` blendet die Sticky-Nav aus, Hintergrund bleibt dark.

### Verifiziert (Update 5)
- `npm run typecheck` ✅
- `npm test` ✅ 18/18
- `npm run build` ✅ — 16 Routen.

---

## Nächste Schritte (priorisiert)

1. **End-to-End-Run mit OpenRouter-Credits:** Sobald Account-Credits vorhanden, vollständigen Run für `HIMS` oder anderer Ticker durchführen und ISIN-Extraktion verifizieren.
2. **ISIN-Quelle verbessern:** OpenFIGI-API oder OpenLEI als dedizierte ISIN-Quelle einbinden (Provider-Adapter, Class B), damit ISIN auch ohne LLM-Extraktion zuverlässig befüllt wird.
3. **Provider-Robustheit:** EDGAR Throttle/Cache-Tests + yfinance-Fallback-Pfade gegen echte Tickers verifizieren.
4. **Compare-Export:** PDF-Export der Vergleichsseite (Re-use der bestehenden Export-Pipeline mit `?print=1`).
5. **E2E-Tests auf Stand bringen:** Smoke-Tests um Export-Dropdown und ISIN-Anzeige erweitern.

---

## Offene Entscheidungen

> Verschobene Punkte stehen in [FUTURE.md](FUTURE.md). Hier nur, was den aktuellen Sprint blockiert.

| Thema | Stand |
|---|---|
| Default-Ollama-Modell | **dynamisch**: erstes verfügbares Modell aus `/api/tags`, persistiert pro User → Detail siehe `FUTURE.md` F-001 |
| GPU-Setup | **Ollama läuft auf dem Host** (aktuell NVIDIA, später Prod AMD). App-Container spricht via `http://host.docker.internal:11434`. Kein GPU-Mapping in Compose nötig. |
| Versionsvergleich | **JSON-Diff + Score-Δ-Tabelle** (entschieden). Semantischer Markdown-Diff → `FUTURE.md` F-006 |
| FMP/Alpha-Vantage-Keys | aus `.env`; bei fehlen Pipeline degradiert auf yfinance+EDGAR. **bestätigt** |

---

## Bekannte Probleme / Risiken

- **JSON-Mode-Zuverlässigkeit** variiert je Ollama-Modell. Gegenmaßnahme: `parseRobustJSON` (portiert aus Pilot) + 1 Repair-Retry; ansonsten Run als `failed` markieren.
- **EDGAR Rate-Limits**: 10 req/s, User-Agent Pflicht — in Adapter implementieren (Throttle + Cache).
- **yfinance** ist inoffiziell und bricht gelegentlich. Adapter muss defensiv parsen; Fallback FMP/AV.
- **Long-Running Runs in Next.js**: API-Routes brauchen `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` für SSE; getrennter Worker erst in Phase 2.
- **DB-File-Lock unter Windows**: VS Code SQLite-Viewer-Extension kann `data/research.db` halten. Migrations-Runner schließt eigenen Handle nach Lauf, aber externe Viewer **vor Migration schließen**.

---

## Changelog

- **2026-05-22 (Update 9)** — OpenRouter-Provider (`openrouter.ts` mit Retry/Backoff/Fallback-Chain), ISIN Ende-zu-Ende (Schema + Extraktor-Prompt + Pipeline + Dashboard), Audit-Dashboard dichter (16 KPIs, 12-Spalten-Grid, kleinere Paddings), Export-Dropdown (PPTX entfernt, JSON hinzugefügt), neuer Audit-JSON-Export-Endpoint, PDF-Ränder verkleinert, SSE-Cleanup + MaxListeners-Fix. `tsc --noEmit` ✅
- **2026-05-22 (Update 8)** — DeepSeek-Provider-Support (`config.ts`, `deepseek.ts`), Settings-API + Einstellungsseite (Provider-Toggle, Test-Verbindung), Logs-Seite neu (runs.jsonl + audit.jsonl), SSE-Bus auf `globalThis` (Fix "warte auf Start"), Ollama `stream:true` (Fix undici headersTimeout), Pipeline parallel (Extract+Sections gleichzeitig), Context 32K→18K / 22K→12K, Rationale max 10 Wörter, Section-Concurrency 2→7. `tsc --noEmit` ✅
- **2026-05-20 (Update 7)** — Versionsvergleich: `report-diff`-Lib + `/reports/compare/[a]/[b]`-Page (Score-Δ, Block-Δ, Indikator-Δ, Key-Metrics-Δ, Listen-Δ, Thesis vorher/nachher), Reports-Liste mit „vs. Vorgänger"-Button, Watchlist-Notes inline editierbar + Unpin. 23/23 Unit, 8/8 E2E, 18 Build-Routen.
- **2026-05-20 (Update 6)** — Sidebar-Refactor (links, ohne Symbole), Watchlist-Pin-API + PinButton, Score-Indikator-Persistenz (`block_audits` in Report-JSON, Indikator-Tabelle im Dashboard), Playwright E2E-Smoke (8/8). Phase 3 abgeschlossen.
- **2026-05-20 (Update 5)** — Export-Layer (PDF via Puppeteer, XLSX via ExcelJS, PPTX via PptxGenJS) + 3 API-Routen + ExportButtons im Dashboard. 16 Routen im Build, alles grün.
- **2026-05-20 (Update 4)** — UI-Komponenten (9 Files) + alle Pages (Home / Run / Reports / Audit-Dashboard / Watchlist / Settings / Logs). Production-Build: 13 Routen, alles grün.
- **2026-05-20 (Update 3)** — Provider-Layer (5 Adapter + Throttle), Orchestrator (7 Steps), SSE-Stream, Run-API. Production-Build verifiziert, 18/18 Tests grün. yahoo-finance2 auf v3.14.1 (v2 unvollständig).
- **2026-05-20 (Update 2)** — Repo-Scaffold gebaut & verifiziert: install, typecheck, 14 Unit-Tests, DB-Migration. Versionen gepinnt: next 14.2.35, eslint 8.57.1, better-sqlite3 12.2.0. Migrations-Runner mit Schema-Drift-Reset.
- **2026-05-20 (Update 1)** — GPU = AMD ROCm im Compose. Default-Modell dynamisch (erstes verfügbares). Versionsvergleich = JSON-Diff + Score-Δ. [FUTURE.md](FUTURE.md) angelegt als verbindliche Sammelstelle für verschobene Entscheidungen.
- **2026-05-20** — Architektur, Stack, Storage, Datenquellen, MVP-Scope, Deployment festgelegt. Doku-Set angelegt.

