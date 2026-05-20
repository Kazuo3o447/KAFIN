# STATUS.md

> **Pflicht:** Diese Datei wird **pro Arbeitssession** aktualisiert. Sie ist das Logbuch des Projekts: aktueller Stand, nächste Schritte, offene Entscheidungen, bekannte Probleme. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

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

1. **End-to-End-Test mit echtem Ollama:** `ollama serve` + Run für `AAPL`/`MSFT`, Audit-Dashboard inkl. Indikator-Tabellen und Compare-Page prüfen.
2. **Provider-Robustheit:** EDGAR Throttle/Cache-Tests + yfinance-Fallback-Pfade gegen echte Tickers verifizieren.
3. **Compare-Export:** PDF/PPTX-Export der Vergleichsseite (Re-use der bestehenden Export-Pipeline mit `?print=1`).
4. **Watchlist-Notes-Test:** Optional E2E-Test für Inline-Edit-Flow.

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

- **2026-05-20 (Update 7)** — Versionsvergleich: `report-diff`-Lib + `/reports/compare/[a]/[b]`-Page (Score-Δ, Block-Δ, Indikator-Δ, Key-Metrics-Δ, Listen-Δ, Thesis vorher/nachher), Reports-Liste mit „vs. Vorgänger"-Button, Watchlist-Notes inline editierbar + Unpin. 23/23 Unit, 8/8 E2E, 18 Build-Routen.
- **2026-05-20 (Update 6)** — Sidebar-Refactor (links, ohne Symbole), Watchlist-Pin-API + PinButton, Score-Indikator-Persistenz (`block_audits` in Report-JSON, Indikator-Tabelle im Dashboard), Playwright E2E-Smoke (8/8). Phase 3 abgeschlossen.
- **2026-05-20 (Update 5)** — Export-Layer (PDF via Puppeteer, XLSX via ExcelJS, PPTX via PptxGenJS) + 3 API-Routen + ExportButtons im Dashboard. 16 Routen im Build, alles grün.
- **2026-05-20 (Update 4)** — UI-Komponenten (9 Files) + alle Pages (Home / Run / Reports / Audit-Dashboard / Watchlist / Settings / Logs). Production-Build: 13 Routen, alles grün.
- **2026-05-20 (Update 3)** — Provider-Layer (5 Adapter + Throttle), Orchestrator (7 Steps), SSE-Stream, Run-API. Production-Build verifiziert, 18/18 Tests grün. yahoo-finance2 auf v3.14.1 (v2 unvollständig).
- **2026-05-20 (Update 2)** — Repo-Scaffold gebaut & verifiziert: install, typecheck, 14 Unit-Tests, DB-Migration. Versionen gepinnt: next 14.2.35, eslint 8.57.1, better-sqlite3 12.2.0. Migrations-Runner mit Schema-Drift-Reset.
- **2026-05-20 (Update 1)** — GPU = AMD ROCm im Compose. Default-Modell dynamisch (erstes verfügbares). Versionsvergleich = JSON-Diff + Score-Δ. [FUTURE.md](FUTURE.md) angelegt als verbindliche Sammelstelle für verschobene Entscheidungen.
- **2026-05-20** — Architektur, Stack, Storage, Datenquellen, MVP-Scope, Deployment festgelegt. Doku-Set angelegt.

