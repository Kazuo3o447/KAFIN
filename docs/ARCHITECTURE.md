# ARCHITECTURE.md

> Pflicht: Jede Aenderung an Modulen, Datenfluss, Schemas oder Schnittstellen wird hier synchron mit Code-Changes dokumentiert.

---

## 1. High-Level

```text
Browser (Next.js Pages/Server Components)
  -> API Routes + SSE
  -> Orchestrator Pipeline (deterministisch)
  -> Provider Layer (capability-basiert)
  -> Scoring / Timing / Fair Value / Trade Setup (TS)
  -> Optionaler Analyst-Layer (LLM-Interpretation)
  -> Storage (SQLite + Filesystem + JSONL Audit)
```

LLM-Aufrufe laufen zentral ueber [../src/lib/llm/ollama.ts](../src/lib/llm/ollama.ts) als Router fuer LM Studio, DeepSeek und Groq.

---

## 2. Relevante Verzeichnisstruktur

```text
src/
  app/
    reports/[id]/page.tsx           # Dense terminal report UI
    api/
      runs/                         # run lifecycle + SSE
      reports/
        [id]/
          chat/route.ts             # POST SSE-Chat-Endpunkt (DE-Kontext aus Report-JSON)
          route.ts                  # report read/export
      market/
        health/route.ts             # GET MarketHealth JSON (cached TTL 30/60 min)
        analyze/route.ts            # POST SSE KI-Marktanalyse (Regime-Brief + Chat)
      settings/                     # provider/settings + test-llm
      watchlist/
      ollama/models/                # provider-agnostic model discovery endpoint
      health/
  components/
    DecisionHero.tsx
    ScoreKpiStrip.tsx
    ScoreTrendSparkline.tsx
    BlockOverviewBars.tsx
    ExportButtons.tsx
    PinButton.tsx
    SourceList.tsx
    ChatPanel.tsx          # SSE-Chat-Client für /api/reports/[id]/chat
    MarketChatPanel.tsx    # SSE-Chat-Client für /api/market/analyze (Regime-Brief + Chat)
    RunStepper.tsx         # Terminal-Stepper für den Research-Ladebildschirm
    RunFindingsPanel.tsx   # "Bisher gefunden"-Seitenleiste (progressiv)
    charts/
      FinancialsChart.tsx  # recharts AreaChart/BarChart
      ScoreTrendChart.tsx  # recharts AreaChart Sparkline
  lib/
    orchestrator/
      pipeline.ts        # nutzt step-manifest für Step-Metadaten
      steps.ts
      events.ts          # RunEventName erweitert: "meta" + StepDoneEvent.summary
      step-manifest.ts   # kanonische Step-Liste (14 Steps, 3 Phasen, key/label/pct)
    providers/
      collect.ts
      types.ts           # Capability-Union inkl. "market_quotes"
      index.ts
      yahoo.ts
      edgar.ts
      fmp.ts
      alphavantage.ts
      rss.ts
      finnhub.ts           # Capability: news_sentiment (Sentiment-Score + Buzz)
      fred.ts              # 6 FRED-Serien + z-Score-Helfer (DGS10/DFII10/BAMLC0A0CM neu)
      market-quotes.ts     # Yahoo-basierte Quotes für 15 Assets (6 Kategorien)
      symbol-resolution.ts
    market/
      health.ts            # MarketHealth-Modul: 3-Säulen, Score 0–100, Cache TTL 30/60 min
    scoring/
      weights.ts
      engine.ts          # pickArchetype() aus Achsen-Profil (P3)
      rubric-fn.ts       # scoreLinear(), moat_returns_composite (P1)
      axes.ts            # Drei-Achsen-Modell Growth·Finance·Moat (P1)
      safety-gate.ts     # Hard-Veto unabhängig vom Score (P1)
      lenses.ts
      gate.ts
      timing.ts
      taxonomy.ts
      critical-metrics.ts
    research/
      normalization.ts
      valuation.ts
      technicals.ts
      regime.ts
      trade-setup.ts
      score-history.ts
      conflict-detector.ts
      assumptions.ts
      output-sanitizer.ts
      thresholds.ts        # inkl. market_vix_panic, market_move_stress, market_hy_zScore_stress
    analyst/
      interpret.ts       # judgeAxis() + interpretAxes() KI-Blending (P2)
      guardrails.ts      # KiAxisJudgment, verifyKiAxisJudgment() (P2)
      evidence.ts
    llm/
      config.ts
      ollama.ts
      deepseek.ts
      groq.ts
      prompts.ts         # KI_AXIS_SYSTEM/USER, Mauboussin-Moat-Prompt (P2)
      repair.ts
    storage/
      db.ts
      schema.ts
      migrate.ts
    schemas/
      report.ts
      dataset.ts
```

Persistenz unter data/:
- research.db
- reports/{TICKER}/*.md + *.json
- raw/{TICKER}/{runId}/
- logs/audit.jsonl
- logs/runs.jsonl

---

## 3. Pipeline-Flow (Ist-Stand)

Orchestrator: [../src/lib/orchestrator/pipeline.ts](../src/lib/orchestrator/pipeline.ts)

### Phase 1: Vorbereitung (sequentiell)

1. fetch: stepFetchBaseData
2. normalize: stepNormalizeDataset
3. metrics: stepDeriveMetrics
4. context: stepBuildContext

### Phase 2: Deterministische Extraktion/Bewertung

5. extract: stepExtractFacts (deterministisch aus Dataset/Faktenpfad)
6. sections: stepAnswerSections (deterministische Rubric-Funktionen, kein Section-LLM)

### Phase 3: Nachverarbeitung

7. score: stepComputeScoreAndGate
8. timing: stepComputeTimingAxis — ruft auch `fetchAndComputeMarketHealth()` auf (gecacht, non-blocking); befüllt `state.marketHealth`
9. peer: stepComputePeerPercentiles
10. fair_value: stepComputeFairValue
11. trade_setup: stepComputeTradeSetup
12. analyst: stepInterpretAnalyst (optional)
13. verdict: stepGenerateVerdict
14. persist: stepPersist — stempelt `market_posture_score`, `market_posture_label`, `market_pillar_agreement` in `report.market_context`

Progress, Step-Start/Done, Meta, Error und Done werden ueber SSE emittiert.

**SSE-Event-Typen (vollständig):**
- `log` — Textlog mit Level
- `progress` — `{ pct: number }` (immer ≤ 99 bis `done`)
- `step:start` — `{ step, label }`
- `step:done` — `{ step, ms, ok, summary? }` (`ok=false` ist non-fatal)
- `meta` — `{ ticker, companyName?, exchange?, currency?, sources? }` (nach normalize)
- `error` — `{ msg }` (hard failure)
- `done` — `{ reportId, gate, scoreTotal }` (triggert Redirect)

---

## 4. Deterministik vs. LLM

Deterministisch:
- Kennzahlen, Scoring, Gate, Category
- Timing/Regime
- Fair Value
- Trade Setup
- Data Quality, Coverage, Konfliktauflosung, Confidence Caps

LLM-basiert (guarded):
- Optionaler Analyst-Layer (Interpretation)
- Verdict-Detail-Text

Wichtige Invariante:
- Numerischer Fingerprint vor/nach Analyst-Schritt muss identisch bleiben.

---

## 5. LLM-Routing

Router: [../src/lib/llm/ollama.ts](../src/lib/llm/ollama.ts)

Provider-Aufloesung:
- lmstudio
- deepseek
- groq

Base URL lokal:
- LLM_BASE_URL
- sonst LM_STUDIO_BASE_URL
- sonst OLLAMA_BASE_URL
- sonst http://localhost:1234

Konfiguration kommt aus [../src/lib/llm/config.ts](../src/lib/llm/config.ts) mit kurzem Cache und Settings-Invalidierung.

---

## 6. Report-Schema und UI

Schema:
- Pflichtfelder in [../src/lib/schemas/report.ts](../src/lib/schemas/report.ts)
- inklusive run_integrity, audit_snapshot, score_interpretation, analyst, trade_setup

Report-UI:
- [../src/app/reports/[id]/page.tsx](../src/app/reports/[id]/page.tsx)
- terminal-dichte Darstellung mit Setup/Regime/Kennzahlen/Charts/Ownership/Advisor
- Kerninfos ohne verpflichtende Akkordeons
- Zone 4d: `<ChatPanel>` — interaktiver DE-Chat zum geladenen Report (SSE-Streaming)

Markets-UI:
- [../src/app/markets/page.tsx](../src/app/markets/page.tsx) — Marktgesundheits-Dashboard
  - Kopfzeile: Posture-Label + Score/100 + Säulen-Zähler + as-of-Stamp + Refresh
  - Quotes-Board: 15 Asset-Kacheln in 6 Kategorien (Indizes / Zinsen / Vol / Rohstoffe / FX / Krypto)
  - Delta-Farbgebung kontextabhängig: neutral (kein Gut/Schlecht) für Rates/Vol/Credit
  - 3-Säulen-Karten mit Subscore-Balken (Breadth / Volatilität / Credit)
  - Zins-/Duration-Block + Faktor-Regime-Block
  - Divergenz-Banner (amber) — getriggert von `health.divergences`
  - `<MarketChatPanel>` kollabierbar — Regime-Brief-Button beim ersten Aufruf, danach Chat
  - KI-Kurzanalyse wenn `health.summary !== null` (aus Cache nach erstem analyze-Aufruf)

Run-/Loading-UI:
- [../src/app/run/[ticker]/page.tsx](../src/app/run/[ticker]/page.tsx) — 3-Bereich Research-Ladebildschirm
  - Kopfzeile: Ticker (mono) · Elapsed mm:ss · %
  - Haupt-Grid (xl: 2-spaltig): `<RunStepper>` + `<RunFindingsPanel>`
  - Fußzeile: 3px Progress-Bar + Log-Toggle
  - Fortschritt capped ≤ 99% bis `done`-Event; dann 1,2s Delay → Redirect

---

## 7. MarketHealth-Modul

Datei: [../src/lib/market/health.ts](../src/lib/market/health.ts)

### 3-Säulen-Methodik

| Säule | Gewicht | Signale |
|---|---:|---|
| Volatilität | 30% | VIX-Regime + MOVE-Stress |
| Credit | 35% | HY-Spread + z-Score 1y/3y |
| Breadth | 35% | %>MA200 (aus FRED-Proxy oder Pipeline-Kontext) |

Score 0–100 → `PostureLabel`: `risk_off` (<35), `neutral` (35–65), `risk_on` (>65).

`pillarAgreement` (0–3): Anzahl Säulen, die mit dem Gesamt-Posture übereinstimmen.

### Rates-Modifier (±5 Punkte)
- Kurveninversion (10Y–2Y < 0): −5
- Positiver Real-Yield > 2,5%: −5

### Divergenz-Erkennung
- VIX hoch + Kurs-Breadth stark → "Volatilität vs. Breadth divergent"
- Credit stress + VIX niedrig → "Credit vs. VIX divergent"

### Cache
- TTL 30 min (08:00–16:00 Ortszeit) / 60 min (außerhalb)
- `?refresh=1` an `/api/market/health` invalidiert manuell

### Endpoints
- `GET /api/market/health` — JSON (cached)
- `POST /api/market/analyze` — SSE-Streaming-LLM, Regime-Brief oder Chat

### Pipeline-Anbindung
- `stepComputeTimingAxis` fetcht MarketHealth (non-blocking), befüllt `state.marketHealth`
- `stepPersist` stempelt `market_posture_score`, `market_posture_label`, `market_pillar_agreement` in `report.market_context`
- `MarketContextSummarySchema` enthält alle drei neuen Felder

---

## 8. Datenbank (Kurzfassung)
- runs
- reports
- watchlist
- settings
- peer_metrics
- score_history

Migrationen: drizzle/migrations/

Drizzle-Schema: [../src/lib/storage/schema.ts](../src/lib/storage/schema.ts)

---

## 9. Events und Live-Logs

Run-Events:
- log
- progress
- step:start
- step:done
- error
- done

SSE-Route:
- /api/runs/[id]/stream

Event-Bus:
- [../src/lib/orchestrator/events.ts](../src/lib/orchestrator/events.ts)

---

## 10. Test-Strategie

Unit (Vitest):
- deterministische Scoring-/Research-Module
- Guardrails, Schema, Persistenzregeln
- Phase-6C Tests fuer trade_setup, advisor, terminal-density, missing-data-inline, no-recompute

E2E (Playwright):
- smoke path fuer zentrale App-Flows

---

## 11. Betriebsregeln

- Keine erfundenen Zahlen im Produktivpfad.
- Kein Ueberschreiben historischer Reports (immutable runs).
- Secrets werden in Logs/URLs redacted persistiert.
- Technische Abruffehler werden als run_integrity sichtbar gemacht.
