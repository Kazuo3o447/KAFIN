# STATUS.md

> **Pflicht:** Diese Datei wird **pro Arbeitssession** aktualisiert. Sie ist das Logbuch des Projekts: aktueller Stand, nächste Schritte, offene Entscheidungen, bekannte Probleme. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

---

## Aktueller Stand — 2026-06-02 (Update 25)

## Aktueller Stand — 2026-06-02 (Update 27)

**Phase:** Konsolidierung abgeschlossen (Quality-GARP + Report-Dashboard v2 + Doku-Sync).

### Umgesetzt

- Quality-GARP-Linse vollständig integriert (Schema, Thresholds, Lens-Profil, Gatekeeper, Engine-Reroute, Orchestrator-Lens-Record).
- Core-Metriken für GARP eingeführt: `ev_fcf`, `fcf_peg`, `forward_fcf_cagr`, `forward_fcf_cagr_source`, `capex_ocf_ratio`, `reverse_dcf_asymmetry`.
- Report-Seite auf Rescue-Brief v2 umgestellt (Markt-Header, Hero, Radar, farbcodierte Blocks, kanonische FV-Brücke, Deep-Dive, Chat-Fokus).
- Fallback-/Robustheitsregeln im UI aktiv: `n/a` statt Sentinel, Dünndaten-Hinweise, Confidence-Dämpfung, Teilfehler-Banner.
- Unit-Tests an v2-Semantik angepasst (`missing-data-inline`, `terminal-density`).

### Verifiziert

- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` ✅
- `npx vitest run` ✅ (67/67 Dateien, 206/206 Tests)

---

## Aktueller Stand — 2026-06-02 (Update 25)

## Aktueller Stand — 2026-06-02 (Update 26)

**Phase:** Report-Dashboard v2 (Rescue Brief) umgesetzt.

### Umgesetzt

- **Neuer Report-IA-Flow** in `src/app/reports/[id]/page.tsx`: Markt-Header -> Hero -> Radar -> 3 Kennzahlenblöcke -> Fair-Value-Brücke -> Deep-Dive -> KI-Chat.
- **Scorecard-Radar (neu):** `src/components/ReportScorecardRadar.tsx` mit Fallback auf `score_heatmap`, Speichen-Hinweis bei dünner Datenlage und Safety-/Confidence-Chips.
- **Farbcodierte Kennzahlenblöcke:** Wachstum/Finanzen/Momentum mit Tooltip-Context, Symbolik (↑/↓/→), Confidence-Dämpfung und Chat-Fokus-Links (`focusMetric`).
- **Kanonische Fair-Value-Brücke erweitert:** `src/components/FairValuePanel.tsx` zeigt jetzt PEG-Leiter, EV/FCF, FCF-PEG, Reverse-DCF und `reverse_dcf_asymmetry`.
- **Deep-Dive-Akkordeons:** Moat/KI, Forensik/Red Flags, Red-Team, Verlauf, Quellen; fehlende Datensätze werden explizit als Provider-Lücke ausgewiesen.
- **Chat-Fallback verbessert:** `src/components/ChatPanel.tsx` prüft Endpoint-Verfügbarkeit, deaktiviert sauber bei fehlendem Backend und unterstützt `initialFocusMetric`.
- **Null-Jahre-/Leerserien-Filter:** Jahreschart-Reihen werden dedupliziert und unbefüllte Jahre entfernt, statt Artefaktlinien zu rendern.

### Tests/Validierung

- `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` ✅
- `npx vitest run` ✅ (67/67 Dateien, 206/206 Tests)
- Tests `missing-data-inline` und `terminal-density` auf v2-Semantik aktualisiert.

---

## Aktueller Stand — 2026-06-02 (Update 25)

**Phase:** Markets-Seite & Markt-Gesundheit (vollständig umgesetzt).

### Umgesetzt

#### Markets-Feature: Backend

- **`src/lib/providers/fred.ts`** erweitert: 6 FRED-Serien (DGS10, DFII10, BAMLC0A0CM neu; BAMLH0A0HYM2, T10Y2Y, VIXCLS bestehend). z-Score-Helfer `mean()`, `stdDev()`, `zScore()`. Gibt zurück: `highYieldSpreadZScore1y`, `highYieldSpreadZScore3y`, `igSpread`, `tenYNominal`, `tenYReal`.
- **`src/lib/providers/types.ts`**: `"market_quotes"` zur `Capability`-Union hinzugefügt.
- **`src/lib/providers/market-quotes.ts`** (NEU): Yahoo-Finance-basierter Quotes-Fetcher für 15 Assets in 6 Kategorien (Index, Rate, Vol, Commodity, FX, Crypto). Gibt `AssetQuote[]` mit `price`, `change1d`, `change1dPct`, `asOf`, `isProxy`, `category`, `currency` zurück.
- **`src/lib/market/health.ts`** (NEU): Kern-MarketHealth-Modul.
  - 3-Säulen-Scoring (Volatilität 30%, Credit 35%, Breadth 35%) mit `PostureLabel` (`risk_off`/`neutral`/`risk_on`).
  - Rates-Modifier (±5 für Inversion/Real-Yield), Divergenz-Erkennung, Factor-Regime-Block.
  - `computeMarketHealth(input)` → `MarketHealth` (Score 0–100, `pillarAgreement` 0–3).
  - `fetchAndComputeMarketHealth()` → parallel FRED + Yahoo, mit In-Memory-Cache TTL 30 min (Handelszeiten) / 60 min (außerhalb). Re-exportiert `AssetQuote`-Typ.
- **`src/lib/research/thresholds.ts`**: 3 neue Schwellen: `market_vix_panic: 30`, `market_move_stress: 120`, `market_hy_zScore_stress: 2.0`.
- **`GET /api/market/health/route.ts`** (NEU): gibt `MarketHealth`-JSON zurück; `?refresh=1` invalidiert Cache.
- **`POST /api/market/analyze/route.ts`** (NEU): SSE-Streaming-LLM-Analyse. `messages=[]` → Regime-Brief; `messages≥1` → Chat über Marktkontext. Gleiches LLM-Routing wie Report-Chat. Guardrails: geerdet im Kontext, keine erfundenen Zahlen. Nach Stream-Ende: Cache-Summary aktualisiert.

#### Markets-Feature: UI

- **`src/components/MarketChatPanel.tsx`** (NEU): Streaming-Chat analog `ChatPanel`. Erster Aufruf generiert Regime-Brief-Button; Folge-Aufruf = interaktiver Chat. Stop-Button, Auto-Scroll.
- **`src/app/markets/page.tsx`** (NEU): `/markets`-Dashboard — Terminal-Kachel-Layout:
  - Kopfzeile: Posture-Label + Score/100 + Säulen-Zähler + as-of-Stamp.
  - Quotes-Board: 15 Asset-Kacheln, nach Kategorie gruppiert, delta-Farbe kontextabhängig (neutral für Rates/Vol).
  - 3-Säulen-Karten (Breadth, Volatilität, Credit) mit Subscore-Balken + Inputs-Detail.
  - Zins-/Duration-Block (10Y nominal, real, ERP, Kurve) + Faktor-Regime-Block.
  - Divergenz-Banner (amber) wenn `health.divergences.length > 0`.
  - KI-Marktanalyse (`MarketChatPanel`) kollabierbar.
  - KI-Kurzanalyse wenn `health.summary !== null`.
  - Refresh-Button + Error-Banner.
- **`src/app/layout.tsx`**: „Märkte"-Nav-Link nach Reports eingefügt.

#### Markets-Feature: Pipeline-Integration

- **`src/lib/schemas/report.ts`**: `MarketContextSummarySchema` um `market_posture_score`, `market_posture_label`, `market_pillar_agreement` erweitert.
- **`src/lib/orchestrator/steps.ts`**:
  - `PipelineState` um `marketHealth?: MarketHealth` erweitert.
  - `stepComputeTimingAxis` ruft `fetchAndComputeMarketHealth()` auf (gecacht, non-blocking); Breadth-Proxy bevorzugt echten Wert aus Pillar-Input.
  - `stepPersist` stempelt `market_posture_score`, `market_posture_label`, `market_pillar_agreement` in `report.market_context`.

### Verifiziert (Update 25)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (67/67 Dateien, 206/206 Tests)

---

## Aktueller Stand — 2026-06-02 (Update 24)

**Phase:** D1 Finnhub news_sentiment + UI-Chat + Research-Ladebildschirm.

### Umgesetzt

#### D1: Finnhub news_sentiment
- `"news_sentiment"` zu `Capability`-Union in `src/lib/providers/types.ts` hinzugefügt.
- `NewsSentimentSchema` + `NewsSentiment`-Typ in `src/lib/schemas/dataset.ts`; `newsSentiment`-Feld in `CompanyDatasetSchema` mit Default `{}`.
- Finnhub-Adapter (`src/lib/providers/finnhub.ts`): `capabilities` + `priorityByCapability` um `news_sentiment` erweitert; Fetch-Handler gegen `GET /news/sentiment?symbol={ticker}` implementiert.
- Collect (`src/lib/providers/collect.ts`): `"news_sentiment"` in `COMPANY_CAPABILITIES`; Parse-Pfad + `newsSentiment` im Dataset-Base; `momentumTotal` von 3 → 4 erweitert.
- Rubric (`src/lib/scoring/rubric-fn.ts`): `news_sentiment_quality` nutzt jetzt primär `newsSentiment.score` (±0.2-Bänder → 8/6/4/2 Punkte); Fallback auf `beatStreak` unverändert.

#### UI-Chat: /api/reports/[id]/chat + ChatPanel
- `src/app/api/reports/[id]/chat/route.ts` (NEU): POST-Endpunkt, lädt Report-JSON, baut deutschen System-Prompt mit Metriken + Analyst + Verdikt, leitet SSE-Stream von LM Studio/DeepSeek/Groq durch; Timeout 60 s.
- `src/components/ChatPanel.tsx` (NEU): Client-Komponente, Props `{ reportId, ticker }`. Features: Nachrichtenverlauf, Streaming mit `▋`-Cursor, Stop-Button, Textarea mit Enter-Shortcut, Error-Display, Auto-Scroll.
- `src/app/reports/[id]/page.tsx`: `ChatPanel` integriert als Zone 4d (zwischen KI-Analyst-Panel und Zone 5).

#### Research-Ladebildschirm (komplettes Redesign)
- `src/lib/orchestrator/step-manifest.ts` (NEU): kanonische Step-Liste — 14 Steps, 3 Phasen (`data`/`analysis`/`valuation`), Schlüssel/Label/pct pro Eintrag. Gemeinsame Quelle für Pipeline und UI.
- `src/lib/orchestrator/events.ts`: `"meta"` zu `RunEventName`-Union hinzugefügt; `MetaEvent`-Interface (`ticker`, `companyName`, `exchange`, `currency`, `sources?`); optionales `summary?: string` auf `StepDoneEvent`.
- `src/lib/orchestrator/pipeline.ts`: importiert Labels/pct aus `step-manifest.ts`; emittiert `meta`-Event nach `normalize`-Step (Firmenname/Börse/Währung); emittiert `summary`-Snippets für Steps `fetch`, `normalize`, `metrics`, `score`; nicht-fatale Step-Fehler → `ok=false` in `step:done` ohne Pipeline-Abbruch.
- `src/components/RunStepper.tsx` (NEU): Terminal-Stepper mit 3 Phasengruppen, Icons (✓/△/○/◌-spin), ms-Anzeige nach Abschluss, Live-Log-Zeile unter aktivem Step, `role="list"`, `aria-live="polite"`, Reduced-Motion-Guard.
- `src/components/RunFindingsPanel.tsx` (NEU): „Bisher gefunden"-Seitenleiste; progressiv befüllt mit Firmenname/Börse/Währung, Datenquellen-Chips, Kennzahlen-Rows aus `metrics`-Summary, Score/Gate aus `score`-Summary.
- `src/app/run/[ticker]/page.tsx` (komplett ersetzt): 3-Bereich-Layout — Kopfzeile (Ticker · Elapsed mm:ss · %), Haupt-Grid xl:2-spaltig (RunStepper + RunFindingsPanel), Fußzeile (3px Progress-Bar + Log-Toggle). Fortschritt capped auf 99 bis `done`-Event; danach 100% → 1,2s Delay → Redirect zu `/reports/[id]`. Fehler-Banner mit Retry-Link. Buffer-Replay-fest durch zustandsbasierte Event-Verarbeitung.

### Verifiziert (Update 24)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (67/67 Dateien, 206/206 Tests)

---

## Aktueller Stand — 2026-06-02 (Update 23)

**Phase:** SCORING V2 + KI-ANALYST (P0–P3) — abgeschlossen.

### Umgesetzt (P0–P3)

#### P0: Daten-Bugs behoben
- **WACC-Pfad-Konsistenz:** `computeWACC()` (CAPM + Debt-Blend) als geteilte Funktion in `derived-metrics.ts`; beide Scoring-Pfade (`deriveKeyMetrics` + `deriveMetricsFromDataset`) verwenden dieselbe Logik.
- **`netDebtToEbitda`:** Verwendet jetzt EBITDA als Nenner (vorher fälschlicherweise EBIT).
- **Regressions-Test:** `tests/unit/p0-wacc-consistency.test.ts` — WACC-Konsistenz + EBITDA-Nenner verifiziert.

#### P1: Drei-Achsen-Modell
- **`src/lib/scoring/axes.ts`** (neu): Growth · Finance · Moat, je 0–100. Quant-Aggregation aus Block-Ergebnissen, KI-Layer in P1 null.
- **`src/lib/scoring/safety-gate.ts`** (neu): Hard-Veto unabhängig vom Score (Liquidität, Überschuldung).
- **`src/lib/scoring/rubric-fn.ts`:** `scoreLinear()`, de-korrelierte Indikatoren (`customer_retention_expansion`, `tam_share_gain_evidence`), `moat_returns_composite` (ROIC-Spread + roicAdj + roicFadeRate, gedeckelt bei 70).
- **`src/lib/research/derived-metrics.ts`:** `roicAdj` (Mauboussin R&D-Kapitalisierung) + `roicFadeRate` (lineare Regression über 5 Jahre).
- **Schema** (`report.ts`): `axes[]` + `safety_gate` hinzugefügt.

#### P2: KI-Analyst Critic Upgrade
- **`src/lib/llm/prompts.ts`:** `KI_AXIS_SYSTEM` + `KI_AXIS_USER()` — Chain-of-Thought Pflichtfeld, Mauboussin 4-Schritt für Moat-Achse, Evidence mit `claim` + `sourceRef`.
- **`src/lib/analyst/guardrails.ts`:** `KiAxisJudgment`-Interface, `verifyKiAxisJudgment()` (Hit-Rate-Verifier), `sanitizeKiAxisJudgment()`.
- **`src/lib/analyst/interpret.ts`:** `judgeAxis()` + `interpretAxes()` — KI-Subscore-Blending mit `kiWeightEffective = kiWeightMax × confidence`; Divergenz-Flagging.
- **Orchestrator:** `stepInterpretAnalyst` führt nach Analyst-Pass `interpretAxes` aus; `needsAxisReview` wenn Divergenz ≥ 25.

#### P3: Polish
- **Archetype-Labels:** `pickArchetype()` in `engine.ts` nutzt Achsen-Profil für differenzierte Kategorie-Auswahl (alle drei Achsen-Werte fließen ein).
- **XLSX-Export:** Neuer "Axes"-Tab mit Quant/KI/Kombiniert/Divergenz/Gewicht/Rating + Safety-Gate-Zusammenfassung.
- **score_history:** Drei neue Spalten (`axes_json`, `safety_status`, `archetype`); idempotente Migration in `db.ts`; `persistScoreHistoryEntry` übergibt Achsen-Snapshot.
- **Drizzle-Migration:** `drizzle/migrations/0003_axes_tracking.sql`.

### Verifiziert (Update 23)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (67/67 Dateien, 206/206 Tests)

### Nächste Schritte

- P3-Erweiterung: Archetype-Labels in UI (ScoreKpiStrip o.ä.) sichtbar machen (derzeit nur in Report-Kategorie-Feld vorhanden).
- KI-Achsen-Scores in `ScoreTrendSparkline` oder Dashboard einblenden (wenn axes in Report-Persistenz gespeichert).
- Regression-Test für die drei Achsen (AXON/MSFT Fixture).

---

## Aktueller Stand — 2026-06-01 (Update 22)

**Phase:** PHASE 6C — Trader-Terminal, Trade-Setup & KI-Beraterebene.

### Umgesetzt

- **Trade-Setup konsequent im Pipeline-/Report-Pfad:**
  - `trade_setup` wird im Analyst-Kontext und finalen Report-Persistenzpfad in `src/lib/orchestrator/steps.ts` durchgaengig gefuehrt.
  - `resolveModels()` respektiert `LLM_MODEL` als globalen Default fuer die komplette Run-Kette.
- **Analyst-Beraterebene vervollstaendigt:**
  - Analyst ist standardmaessig aktiv, wenn nicht explizit deaktiviert (`ENABLE_ANALYST_LLM !== "0"`).
  - Thesis/Open-Questions/Falsifikation werden im State aus den neuen Advisor-Feldern (`numbersSay`, `entryTrigger`, `exitWatchTrigger`) gespiegelt.
- **LM-Studio Base-URL-Alias harmonisiert:**
  - `src/lib/llm/ollama.ts` akzeptiert jetzt `LLM_BASE_URL` (vor `LM_STUDIO_BASE_URL`/`OLLAMA_BASE_URL`).
- **Trader-Terminal UI (dicht, nicht accordion-first):**
  - `src/app/reports/[id]/page.tsx` als kompaktes Terminal-Layout neu gebaut:
    - 1-zeilige Statusleiste
    - 3-Panel-Toprow (`Trade Setup`, `Verdikt`, `Markt Regime`)
    - immer sichtbare Kennzahlen + Momentum-Reihe
    - 3 Mini-Chart-Panels
    - Ownership/Smart-Money-Reihe
    - KI-Beraterblock mit expliziten Entry/Exit-Triggern
  - Keine verpflichtenden `CollapsibleSection`-Container fuer Kerninformationen.

### Neue Tests (Phase 6C)

- `tests/unit/trade-setup.test.ts`
- `tests/unit/analyst-advisor.test.ts`
- `tests/unit/terminal-density.test.tsx`
- `tests/unit/missing-data-inline.test.tsx`
- `tests/unit/no-recompute.test.ts`
- `vitest.config.ts` erweitert fuer `.test.tsx`.

### AXON Referenz

- Das 6C-Layout ist fuer den Trader-Workflow auf schnelle Entscheidungslesbarkeit optimiert (AXON-Referenzstil): erst Setup/Regime/Actionability, danach Details und Quellen.

### Verifiziert (Update 22)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (66/66 Dateien, 197/197 Tests)

**Phase:** PHASE 6C — Trader-Terminal, Trade-Setup & KI-Beraterebene.

### Umgesetzt

- **Trade-Setup konsequent im Pipeline-/Report-Pfad:**
  - `trade_setup` wird im Analyst-Kontext und finalen Report-Persistenzpfad in `src/lib/orchestrator/steps.ts` durchgaengig gefuehrt.
  - `resolveModels()` respektiert `LLM_MODEL` als globalen Default fuer die komplette Run-Kette.
- **Analyst-Beraterebene vervollstaendigt:**
  - Analyst ist standardmaessig aktiv, wenn nicht explizit deaktiviert (`ENABLE_ANALYST_LLM !== "0"`).
  - Thesis/Open-Questions/Falsifikation werden im State aus den neuen Advisor-Feldern (`numbersSay`, `entryTrigger`, `exitWatchTrigger`) gespiegelt.
- **LM-Studio Base-URL-Alias harmonisiert:**
  - `src/lib/llm/ollama.ts` akzeptiert jetzt `LLM_BASE_URL` (vor `LM_STUDIO_BASE_URL`/`OLLAMA_BASE_URL`).
- **Trader-Terminal UI (dicht, nicht accordion-first):**
  - `src/app/reports/[id]/page.tsx` als kompaktes Terminal-Layout neu gebaut:
    - 1-zeilige Statusleiste
    - 3-Panel-Toprow (`Trade Setup`, `Verdikt`, `Markt Regime`)
    - immer sichtbare Kennzahlen + Momentum-Reihe
    - 3 Mini-Chart-Panels
    - Ownership/Smart-Money-Reihe
    - KI-Beraterblock mit expliziten Entry/Exit-Triggern
  - Keine verpflichtenden `CollapsibleSection`-Container fuer Kerninformationen.

### Neue Tests (Phase 6C)

- `tests/unit/trade-setup.test.ts`
- `tests/unit/analyst-advisor.test.ts`
- `tests/unit/terminal-density.test.tsx`
- `tests/unit/missing-data-inline.test.tsx`
- `tests/unit/no-recompute.test.ts`
- `vitest.config.ts` erweitert fuer `.test.tsx`.

### AXON Referenz

- Das 6C-Layout ist fuer den Trader-Workflow auf schnelle Entscheidungslesbarkeit optimiert (AXON-Referenzstil): erst Setup/Regime/Actionability, danach Details und Quellen.

### Verifiziert (Update 22)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (66/66 Dateien, 197/197 Tests)

---

## Aktueller Stand — 2026-06-01 (Update 21)

**Phase:** KORREKTUR-02 — Resilienz, Versionierung & Konsistenz (Vervollstaendigung).

### Umgesetzt

- **Fetch-Status-Modell + Lauf-Integritaet (P0.1):**
  - `MissingValueStatus` + Capability-Diagnostik in `src/lib/providers/types.ts`.
  - Retry/Backoff + Statusklassifikation in `src/lib/providers/collect.ts`.
  - `stepFetchBaseData` markiert technische Unvollstaendigkeit und setzt Retry-Empfehlung.
  - Report-Felder `run_integrity.*` inkl. Banner und `fetch_statuses` in `src/lib/schemas/report.ts` + Persistenz.
- **Audit-Record Versionierung/Immutability (P0.2/P0.3):**
  - `THRESHOLDS.version/changelog`, `ASSUMPTIONS_VERSION` eingefuehrt.
  - Report persistiert `audit_snapshot` (`codeVersion`, `thresholdSetVersion`, `assumptionsVersion`, `dataSnapshotId`, `providerVersions`, `runAt`).
  - `score_interpretation` (`as_was` vs. `rescored_current_thresholds`) im Schema und Report-UI gekennzeichnet.
- **Kanonische Taxonomie + Ownership-Block (P1.1):**
  - Neuer bewerteter Block `ownership_smart_money` in Gewichten, Schema, Rubric, Lens-Profilen und Prompt-Blockliste.
  - Kanonisches Mapping in `src/lib/scoring/taxonomy.ts`.
- **Provider-Konfliktaufloesung (P1.2):**
  - Deterministische Praezedenz in `src/lib/research/conflict-detector.ts`.
  - Konfliktgewinner wird als aufgeloester Fakt injiziert; Konflikte sichtbar in `data_quality.coverage.conflictingMetrics`.
- **Kritische Kennzahlen (P1.3):**
  - Lens-spezifische Kritikalitaet in `src/lib/scoring/critical-metrics.ts`.
  - Confidence-Capping und `missingCriticalMetrics` in `stepComputeScoreAndGate` verdrahtet.
- **Skalen-/Leasing-/FX-Details (P2.1/P2.2):**
  - x1000-Skalenverdacht in `src/lib/research/debt-breakdown.ts`.
  - NetDebt/EBITDA im Pipeline-Override auf interest-bearing debt ausgerichtet.
  - Periodenbezogene FX-Normalisierung in `src/lib/research/normalization.ts` (`PAIR@periodEnd`).
- **Secrets-Hygiene (P2.4):**
  - `src/lib/utils/secrets.ts` (Pattern-Scan + URL-Redaction).
  - Source-URLs werden vor Persistenz tokenbereinigt.

### Neue Tests

- `tests/unit/fetch-status.test.ts`
- `tests/unit/threshold-versioning.test.ts`
- `tests/unit/taxonomy-mapping.test.ts`
- `tests/unit/provider-conflict.test.ts`
- `tests/unit/critical-metrics.test.ts`
- `tests/unit/scale-lease-consistency.test.ts`
- `tests/unit/fx-asof.test.ts`
- `tests/unit/secrets-scan.test.ts`
- `tests/regression/reference-companies.test.ts`
- `vitest.config.ts` erweitert: Regression-Suite wird mitausgefuehrt.

### Verifiziert (Update 21)

- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (61/61 Dateien, 191/191 Tests)

---

## Aktueller Stand — 2026-06-01 (Update 19)

**Phase:** Governance-Hardening — Datenintegritaet & KI-Grenzen (Grundregel ueber allen Phasen).

### Umgesetzt

- **Schema-Invariante Herkunft:** `src/lib/schemas/dataset.ts` validiert jetzt hart: bei `Tracked.value !== null` muss `provenance.asOf` gesetzt sein.
- **Value-Kind Label:** `Tracked` traegt `kind` (`actual|estimate|derived|assumption`) mit Default `actual`.
- **Annahmen zentralisiert:** `src/lib/research/assumptions.ts` (NEU) als Single Source fuer WACC-/DCF-/Fair-Value-Annahmen.
- **Annahmen sichtbar im Report:** `src/lib/schemas/report.ts` + `src/lib/orchestrator/steps.ts` + `src/app/reports/[id]/page.tsx` fuehren und rendern Abschnitt `Annahmen`.
- **LLM-Numerik-Grenze runtime:** `stepInterpretAnalyst` in `src/lib/orchestrator/steps.ts` prueft numerische Fingerprints vor/nach Analyst-Schritt.
- **No-numeric-fallback Hardening:** mehrere Fallback-Koerzungen in `src/lib/{research,scoring}` fuer Kennzahlenpfade entfernt.
- **DoD-Tests ergaenzt:**
  - `tests/unit/provenance-required.test.ts`
  - `tests/unit/no-numeric-fallback.test.ts`
  - `tests/unit/llm-no-numbers.test.ts`
  - `tests/unit/assumptions-centralized.test.ts`
  - `tests/unit/value-kind.test.ts`
  - `tests/unit/no-seed-in-prod.test.ts`

### Hinweis

- KI-Interpretation bleibt optional und klar getrennt vom deterministischen Score.

---

## Aktueller Stand — 2026-06-01 (Update 17)

**Phase:** 6 — Research-Abschluss: Logik-Feinschliff, Dashboard & LM-Studio-Umstieg.

### Vorhanden (zusätzlich zu Update 16)

#### Phase-6 Logik-Feinschliff
- **`src/lib/research/sector-baselines.ts`** (NEU): sektor-relative Baselines und Baseline-Signale.
- **`src/lib/research/combo-signals.ts`** (NEU): deterministische Interaktionssignale und Confidence-Score.
- **`src/lib/research/score-history.ts`** (NEU): Score-Verlauf, Trendableitung und Persistenz in `score_history`.
- **`src/lib/storage/schema.ts`** / **`src/lib/storage/db.ts`** / **`drizzle/migrations/0002_score_history.sql`** (GEÄNDERT/NEU): neue Score-History-Tabelle.
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): Persistenz schreibt `market_context`, `sector_baseline_used`, `combo_flags`, `confidence_score` und `score_trend` in den Report.
- **`src/lib/schemas/report.ts`** (GEÄNDERT): neue Report-Felder für Phase 6.

#### Dashboard-Redesign
- **`src/app/reports/[id]/page.tsx`** (GEÄNDERT): Markt-Header mit Regime/Breadth/VIX/HY-Spread, Confidence-/Trend-Panel, Formula-Summary.
- **`src/components/ScoreTrendSparkline.tsx`** (NEU): Verlaufssparkline auf Basis der Score-Historie.

#### LM-Studio-Umstieg
- **`src/lib/llm/config.ts`** (GEÄNDERT): lokaler Default-Provider ist jetzt `lmstudio`; legacy `ollama` wird auf `lmstudio` normalisiert.
- **`src/lib/llm/ollama.ts`** (GEÄNDERT): lokaler Client spricht den OpenAI-kompatiblen LM-Studio-Endpunkt an (`/v1/models`, `/v1/chat/completions`).
- **`src/app/api/settings/test-llm/route.ts`** / **`src/app/settings/page.tsx`** / **`src/app/page.tsx`** / **`src/app/layout.tsx`** (GEÄNDERT): UI und Testpfad auf LM Studio umgestellt.

### Verifiziert (Update 17)
- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (46/46 Dateien, 160/160 Tests)

### Offen / nächste wahrscheinliche Pflegepunkte
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) und [docs/MANIFEST.md](MANIFEST.md) sollten bei der nächsten Runde noch um weitere Phase-6-Schnittstellen ergänzt werden, falls zusätzliche Felder oder APIs hinzukommen.

---

## Aktueller Stand — 2026-06-01 (Update 15)

**Phase:** 3 — Momentum, Sentiment & Marktregime + Retrofit Sektor-Router + Retrofit Reporting-Politik.

### Vorhanden (zusätzlich zu Update 14)

#### (A) Timing-Achse und Marktregime
- **`src/lib/research/technicals.ts`** (NEU): SMA/EMA, 52W-Position, RSI, MACD, RS vs. Index/Sektor, ATR, realisierte Volatilität, OBV-Trend, Beta.
- **`src/lib/research/regime.ts`** (NEU): deterministische Regime-Klassifikation `risk_on|neutral|risk_off`, inkl. Breadth-Proxy-Flag `breadthIsProxy`.
- **`src/lib/scoring/timing.ts`** (NEU): Timing-Score (0..100), Quadrant (`kaufen|warten|spekulativ|meiden`) und regime-bewusste Aktionstabelle.
- **`src/lib/orchestrator/pipeline.ts` / `steps.ts`** (GEÄNDERT): neuer Step `stepComputeTimingAxis`; Timing bleibt orthogonal und verändert den Fundamental-Score nicht.

#### (B) Retrofit Sektor-Router (Phase-2-Korrektur)
- **`src/lib/scoring/sector-router.ts`** (NEU): Klassifikation in `industrial_software|financials|reit|insurance|biotech_pre_revenue|commodity_cyclical`.
- **`src/lib/scoring/engine.ts`** (GEÄNDERT): Router vorgelagert; bei inkompatiblen Klassen deterministische Markierung `notScorableWithStandardRubric` statt irreführendem Standard-Score.
- Sektor-Raster-Stubs für spätere Erweiterung dokumentiert (`SECTOR_RUBRIC_STUBS`).

#### (C) Retrofit Reporting-Politik (Phase-1-Korrektur)
- **`src/lib/research/normalization.ts`** (NEU): `normalizeDataset()` vor Metrics/Scoring; Währungsnormalisierung, TTM aus letzten 4 Quartalen, getrennte GAAP-vs-adjusted Darstellung (SBC explizit).
- **`src/lib/orchestrator/pipeline.ts`** (GEÄNDERT): neuer PRE-Step `stepNormalizeDataset` vor `stepDeriveMetrics`.

#### Schema-/Report-Erweiterung
- **`src/lib/schemas/report.ts`** (GEÄNDERT): neue Felder für `technicals`, `regime`, `timing_score`, `quadrant`, `action_recommendation`, `breadth_is_proxy`, `rubric_class`, `not_scorable_*`, `reporting_currency`, `gaap_vs_adjusted`.
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): Persistenz dieser Felder in Report JSON/MD.

#### Neue Tests (Phase 3)
- `tests/unit/technicals.test.ts`
- `tests/unit/regime.test.ts`
- `tests/unit/timing-orthogonality.test.ts`
- `tests/unit/quadrant-action.test.ts`
- `tests/unit/sector-router.test.ts`
- `tests/unit/normalization.test.ts`

### Verifiziert (Update 15)
- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (40/40 Dateien, 154/154 Tests)
- `chatJSON` im neuen Pfad `src/lib/research/**` + `src/lib/scoring/**`: keine Treffer

### Hinweis zur Planänderung
- Phase 7 (Kalibrierung/Backtest) ist als neuer separater Folge-Abschnitt eingeplant; in dieser Phase bewusst nicht umgesetzt.

---

## Aktueller Stand — 2026-06-01 (Update 14)

**Phase:** 2 — Deterministisches Scoring (lensenbasiert, reproduzierbar, ohne LLM-Scoringpfad).

### Vorhanden (zusätzlich zu Update 13)

#### Deterministische Phase-2 Module
- **`src/lib/research/estimates-signals.ts`** (NEU): SUE, Beat-Streak, Revisions-Balance.
- **`src/lib/research/inflection.ts`** (NEU): Inflection-Flags (Marge/FCF-Turn, Acceleration, Revisions-Momentum).
- **`src/lib/research/ownership-signals.ts`** (NEU): Cluster-Buy, Short-/Squeeze-Setup, Ownership-Score.
- **`src/lib/research/valuation.ts`** (NEU): Regime-Erkennung (`pre_profit|cyclical|mature`) + Fair-Value-Corridor.
- **`src/lib/scoring/lenses.ts`** (NEU): Lens-Profile, Block-Gewichte, Gate-Parameter.
- **`src/lib/scoring/rubric-fn.ts`** (NEU): Deterministische Indikator-Funktionen inkl. `reason` + `inputs`.
- **`src/lib/scoring/engine.ts`** (NEU): End-to-End Lens-Scoring inkl. Gate/Category, AAQS-Binary, Stability.

#### Orchestrator-Integration (Scoringpfad ohne Section-LLM)
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT):
  - `stepFetchBaseData()` sammelt jetzt `CompanyDataset` + `MarketContext` via `gatherCompanyDataset()`/`gatherMarketContext()`.
  - `stepAnswerSections()` nutzt deterministische Rubric-Funktionen aus `scoreCompany()` statt LLM-Section-Scoring.
  - `stepComputeScoreAndGate()` konsumiert Lens-Ergebnis (`quality_compounder`) direkt für Score/Gate/Category.
  - Persistenz schreibt Lens-Resultate in den Report (inkl. `valuation_regime`, `fair_value_corridor`, `inflection_flags`, `ownership_score`, `aaqs_binary`, `stability_scores`, `lens_results`).

#### Schema-Erweiterung
- **`src/lib/schemas/report.ts`** (GEÄNDERT): neue Felder für Phase 2 und erweiterte Blockindikatoren (`reason`, `inputs`).

#### Neue Unit-Tests (Phase 2)
- `tests/unit/scoring-reproducibility.test.ts`
- `tests/unit/valuation-regime.test.ts`
- `tests/unit/valuation-stability.test.ts`
- `tests/unit/inflection.test.ts`
- `tests/unit/ownership-signals.test.ts`
- `tests/unit/rubric-fn.test.ts`
- `tests/unit/lenses.test.ts`
- `tests/unit/dataset-fixture.ts` (Test-Helfer)

### Verifiziert (Update 14)
- `npm run typecheck` ✅ (exit 0)

### Hinweis
- Der Scoringpfad ist jetzt deterministisch verdrahtet; LLM verbleibt für Extract/Summary/Red-Team/Detail-Texte.

---

## Aktueller Stand — 2026-06-01 (Update 13)

**Phase:** 1 — Datenschicht V2 (typisiert, herkunftsnachverfolgbar, capability-basiert).

### Vorhanden (zusätzlich zu Update 12)

#### Neuer Datensatz-Vertrag (Zod)
- **`src/lib/schemas/dataset.ts`** (NEU): `CompanyDatasetSchema` und `MarketContextSchema` inkl. `ProvenanceSchema`, `Tracked`-Werte, `CoverageReportSchema`.
- Alle Faktenfelder sind nullable, Herkunft ist verpflichtend (`source`, `url`, `klass`, `asOf`, `stale`).
- `MarketContext.regime` bleibt bewusst `null` (Rohwerte nur; Klassifikation in späterer Phase).

#### Capability-Registry und Provider-V2
- **`src/lib/providers/types.ts`** (GEÄNDERT): `Capability`, `DataProviderV2`, `ProviderFetchResultV2`, `SourceClassSchema` ergänzt.
- **`src/lib/providers/index.ts`** (GEÄNDERT): zweite Registry (`ALL_PROVIDERS_V2`), `activeProvidersV2()`, capability-basierte Provider-Auswahl (`providersForCapability`).
- Bestehende Legacy-Provider bleiben für den aktuellen Orchestrator-Pfad erhalten.

#### Neue Adapter + Symbolauflösung
- **`src/lib/providers/finnhub.ts`** (NEU): `estimates`, `earnings_history`, `insider`, `short_interest`, `analyst`, `institutional`.
- **`src/lib/providers/fred.ts`** (NEU): `macro` mit FRED-Serien (`BAMLH0A0HYM2`, `T10Y2Y`, `VIXCLS`).
- **`src/lib/providers/edgar-insider.ts`** (NEU): Form-4-basiertes Insider-Feed.
- **`src/lib/providers/edgar-13f.ts`** (NEU): 13F-`asOf`-Ermittlung/Provenance (US-only, lückenbehaftet).
- **`src/lib/providers/symbol-resolution.ts`** (NEU): Ticker/ISIN/WKN-Auflösung mit Cache (`symbol_map`), ISIN-Prüfziffervalidierung und robustem Fallback.

#### Sammler (degradation chain + Raw-Persistenz)
- **`src/lib/providers/collect.ts`** (NEU): `gatherCompanyDataset()` und `gatherMarketContext()`.
- Capability-Ausführung per Fallback-Kette (Primär → Fallback), unabhängige Capabilities parallel via `Promise.allSettled`.
- Rohartefakte werden unter `data/raw/{TICKER}/{runId}/...` persistiert.
- `stale` wird deterministisch aus `THRESHOLDS.stale_data_max_months` gesetzt.
- `coverage` wird pro Dimension + global berechnet.

#### Interface-Hebung bestehender Adapter
- **`src/lib/providers/yahoo.ts`**, **`src/lib/providers/edgar.ts`**, **`src/lib/providers/fmp.ts`**, **`src/lib/providers/alphavantage.ts`**, **`src/lib/providers/rss.ts`** (GEÄNDERT): jeweils V2-Export ergänzt.

#### LLM-Faktenpfad-Bereinigung (Teilphase)
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): ISIN-Normalisierung auf `symbol-resolution` zentralisiert (`normalizeIsin()` wiederverwendet).
- Kein `chatJSON`-Aufruf in den neuen Datenpfadmodulen (`providers/collect.ts`, neue V2-Adapter).

#### Neue Tests + Fixtures
- **`tests/unit/dataset-schema.test.ts`** (NEU)
- **`tests/unit/collect-degradation.test.ts`** (NEU)
- **`tests/unit/provenance-staleness.test.ts`** (NEU)
- **`tests/unit/symbol-resolution.test.ts`** (NEU)
- Fixtures unter **`tests/unit/fixtures/`**: `finnhub-estimates.json`, `fred-sample.json`, `edgar-insider-sample.json`, `edgar-13f-sample.json`.

### Verifiziert (Update 13)
- `npm run typecheck` ✅ (exit 0)
- `npm test` ✅ (27/27 Dateien, 126/126 Tests)

### Hinweise / Scope
- Kennzahlen-Berechnung, Indikatoren, Scoring-Logik, Linsen-Entscheidungen, LLM-Interpretation und UI bleiben außerhalb dieser Phase.
- Upgrade-Pfad für globale Paid-Ownership/Fundamentals-Provider ist dokumentiert (siehe AGENT-Update), aber nicht implementiert.

---

## Aktueller Stand — 2026-05-23 (Update 11)

**Phase:** G — Provider-Wechsel OpenRouter → Groq, Modell-Optimierung.

### Vorhanden (zusätzlich zu Update 10)

#### Groq-Provider (Ersatz für OpenRouter)
- **`src/lib/llm/groq.ts`** (NEU): OpenAI-kompatibler Client gegen `https://api.groq.com/openai/v1`. Retry/Backoff bei transienten HTTP-Fehlern und Netzwerkfehlern. Bei HTTP 429: `Retry-After`-Header + Body-Regex-Fallback werden ausgewertet, exakte Wartezeit bis max. 90 s. Kein `response_format` (Kompatibilität mit Reasoning-Modellen wie `openai/gpt-oss-120b`). `AbortSignal.timeout` 60 s als harter Cutoff.
- **`src/lib/llm/config.ts`** (GEÄNDERT): `LLMProvider` = `"ollama" | "deepseek" | "groq"`. `LLMConfig` um `groqApiKey` / `groqModel` erweitert. DB-Keys: `groq_api_key`, `groq_model`. Default-Modell: `meta-llama/llama-4-scout-17b-16e-instruct`.
- **`src/lib/llm/ollama.ts`** (GEÄNDERT): `chatJSON()` routet auf `chatJSONGroq` statt `chatJSONOpenRouter`.
- **`src/app/settings/page.tsx`** (GEÄNDERT): Provider-Tab „OpenRouter" → „Groq". Placeholder `gsk_...`, Modell-Default + Docs-Link aktualisiert.
- **`src/app/api/settings/test-llm/route.ts`** (GEÄNDERT): Konnektivitätstest gegen `api.groq.com`.
- **`src/lib/orchestrator/steps.ts`** (GEÄNDERT): Section-Concurrency: `deepseek`=7, `ollama`/`groq`=1 (TPM-Limit-Schutz).

#### Modell-Selektion
- Analysiert: alle verfügbaren Groq-Modelle auf dem Account nach TPM, TPD, Preis, Kontext.
- **Gewählt:** `meta-llama/llama-4-scout-17b-16e-instruct` — 30K TPM (höchstes aller Standardmodelle), 500K TPD, 128K Kontext, $0.11/$0.34 pro M Tokens, 594 TPS.
- Verworfen: `openai/gpt-oss-120b` (nur 8K TPM, Reasoning-Overhead, Rate-Limit bei jedem Run).

### Audit-Log-Befund (HIMS-Testruns)
| Run | Modell | Ergebnis |
|---|---|---|
| `23b4fc35` | `openai/gpt-oss-120b` | 1/5 Steps OK — 4× TPM-429 (8K-Limit erschöpft nach Extract) |
| `8cd615b1` | `meta-llama/llama-4-scout-17b-16e-instruct` | 10/10 Steps OK — Gesamtlaufzeit ~52 s |

### Verifiziert (Update 11)
- `npm run typecheck` ✅ (exit 0)
- Groq-Run HIMS mit `llama-4-scout`: alle 10 Steps grün ✅

---

## Aktueller Stand — 2026-05-23 (Update 12)

**Phase:** G.2 — Trust Layer v2, Metric Applicability, Output-Hygiene, Compile-Stabilisierung.

### Vorhanden (zusätzlich zu Update 11)

#### Trust Layer v2 (Pipeline)
- **`src/lib/orchestrator/pipeline.ts`** (GEÄNDERT): Initialisiert neue Audit-/Trace-Container (`effectiveModels`, `llmCalls`, `auditEvents`, `dataQuality`) im Pipeline-State.
- **`src/lib/orchestrator/steps.ts`** (STARK GEÄNDERT):
  - Effective-Model-Trail pro LLM-Step (`extract`, `sections`, `summary`, `redteam`, `verdict`) inkl. Provider, requested/effective model, Token, Rate-Limit, Fingerprint.
  - Applicability-aware Scoring: nicht anwendbare Metriken werden aus Coverage-/Signal-Bewertung ausgeschlossen.
  - Deterministische Override-Regeln auf Indikator-Ebene (`deterministicIndicatorScore`) vor Gate-Berechnung.
  - Data-Quality + Confidence-Caps: fehlende kritische Metriken/unsupported claims senken Confidence deterministisch.
  - Output-Hygiene: Sanitizer + Red-Flag-Clustering vor Persistenz.
  - Hard-Blocker-Policy als separater deterministischer Pass.
  - Summary-/Rationale-Konsistenzprüfungen; widersprüchliche Claims werden entschärft und auditiert.

#### Neue Trust-Layer-Module
- **Research:**
  - `src/lib/research/output-sanitizer.ts`
  - `src/lib/research/redflag-cluster.ts`
  - `src/lib/research/business-model-classifier.ts`
  - `src/lib/research/metric-applicability.ts`
  - `src/lib/research/rationale-consistency.ts`
  - `src/lib/research/summary-consistency.ts`
  - `src/lib/research/hard-blocker-policy.ts`
  - `src/lib/research/reverse-dcf-classification.ts`
  - `src/lib/research/debt-breakdown.ts`
- **Scoring:**
  - `src/lib/scoring/confidence-cap.ts`
  - `src/lib/scoring/deterministic.ts`

#### Schema-/Audit-Erweiterung
- **`src/lib/schemas/report.ts`** (GEÄNDERT): Trust-Layer-v2 Felder erweitert (`models`, `data_quality`, `trader_cockpit`, zusätzliche Audit-Strukturen), `growth_research_score` nullable.
- **`src/lib/storage/audit.ts`** (GEÄNDERT): Audit-Events enthalten Provider + requested/effective model + Rate-Limit + Fingerprint.
- **`src/lib/research/source-validation.ts`** (GEÄNDERT): unsupported source refs werden auditierbar gemacht, aber nicht als UI-Red-Flag geleakt.

#### Compile-Fixes nach Nullable/Type-Expansion
- **`src/app/reports/[id]/page.tsx`**: null-safe Score-Prop.
- **`src/lib/diff/report-diff.ts`**: null-safe score delta und Meta.
- **`src/lib/export/pptx.ts`**, **`src/lib/export/xlsx.ts`**: null-safe Score-Export.
- **`src/lib/research/fair-value.ts`**: Reverse-DCF-Klassifikationslabels mit zentralem Classifier synchronisiert (`reasonable`, `speculative`).
- **`src/lib/llm/openrouter.ts`**: Rückgabestruktur auf erweitertes `ChatJSONResult` angehoben (Kompatibilität für Legacy-Pfade).

#### Neue Unit-Tests (Trust Layer)
- `tests/unit/metric-applicability-rule40.test.ts`
- `tests/unit/signals-do-not-flag-non-applicable-metrics.test.ts`
- `tests/unit/output-sanitizer-hard-blockers.test.ts`
- `tests/unit/output-sanitizer-red-flags.test.ts`
- `tests/unit/rationale-consistency.test.ts`
- `tests/unit/summary-consistency-guard.test.ts`
- `tests/unit/deterministic-scoring-overrides-llm.test.ts`
- `tests/unit/debt-breakdown-provider-total-debt.test.ts`
- `tests/unit/reverse-dcf-single-classifier.test.ts`

Zusätzlich angepasst:
- `tests/unit/research-pipeline.test.ts` auf audit-only Verhalten bei unsicheren Quellenreferenzen.

### Verifiziert (Update 12)
- `npm run typecheck` ✅ (exit 0)
- `npm run lint` ✅ (keine ESLint-Warnungen/-Fehler)
- `npm test` ✅ (23/23 Test-Dateien, 118/118 Tests)

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

1. **HIMS-Akzeptanzlauf unter Groq:** Vollständigen End-to-End-Run durchführen und Audit-JSON auf `requestedModel/effectiveModel`-Trail, Rate-Limit-Metadaten und Datenqualitäts-Caps prüfen.
2. **Trust-Layer-E2E-Absicherung:** Playwright-Szenario ergänzen, das verifiziert: keine QA-Telemetrie in Red-Flags/Hard-Blockers und konsistente Summary-Ausgabe im UI.
3. **ISIN-Quelle verbessern:** OpenFIGI-API oder OpenLEI als dedizierte ISIN-Quelle einbinden (Provider-Adapter, Class B), damit ISIN auch ohne LLM-Extraktion zuverlässig befüllt wird.
4. **Compare-Export:** PDF-Export der Vergleichsseite (Re-use der bestehenden Export-Pipeline mit `?print=1`).

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
- **Cloud-Provider-Variabilität:** Angefragtes und effektiv ausgeführtes Modell können abweichen. Gegenmaßnahme: persistenter Model-Trail im Report und in `audit.jsonl`.
- **EDGAR Rate-Limits**: 10 req/s, User-Agent Pflicht — in Adapter implementieren (Throttle + Cache).
- **yfinance** ist inoffiziell und bricht gelegentlich. Adapter muss defensiv parsen; Fallback FMP/AV.
- **Long-Running Runs in Next.js**: API-Routes brauchen `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` für SSE; getrennter Worker erst in Phase 2.
- **DB-File-Lock unter Windows**: VS Code SQLite-Viewer-Extension kann `data/research.db` halten. Migrations-Runner schließt eigenen Handle nach Lauf, aber externe Viewer **vor Migration schließen**.

---

## Changelog

- **2026-05-23 (Update 12)** — Trust Layer v2 abgeschlossen: effective-model trace, applicability-aware scoring, deterministic indicator safeguards, confidence caps, hard-blocker policy, output sanitizer + clustering, rationale/summary consistency, debt-breakdown + reverse-DCF classifier sync. Nullable-score Compile-Fixes (Report/Diff/Exports) und bestehender Pipeline-Test auf audit-only Source-Validation angepasst. Verifiziert mit `typecheck`, `lint`, `test` (118/118).
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

