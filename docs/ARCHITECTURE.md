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
      reports/                      # report read/export
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
  lib/
    orchestrator/
      pipeline.ts
      steps.ts
      events.ts
    providers/
      collect.ts
      types.ts
      index.ts
      yahoo.ts
      edgar.ts
      fmp.ts
      alphavantage.ts
      rss.ts
      finnhub.ts
      fred.ts
      symbol-resolution.ts
    scoring/
      weights.ts
      engine.ts
      rubric-fn.ts
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
    analyst/
      interpret.ts
      guardrails.ts
      evidence.ts
    llm/
      config.ts
      ollama.ts
      deepseek.ts
      groq.ts
      prompts.ts
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
8. timing: stepComputeTimingAxis
9. peer: stepComputePeerPercentiles
10. fair_value: stepComputeFairValue
11. trade_setup: stepComputeTradeSetup
12. analyst: stepInterpretAnalyst (optional)
13. verdict: stepGenerateVerdict
14. persist: stepPersist

Progress, Step-Start/Done, Error und Done werden ueber SSE emittiert.

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

---

## 7. Datenbank (Kurzfassung)

Tabellen:
- runs
- reports
- watchlist
- settings
- peer_metrics
- score_history

Migrationen: drizzle/migrations/

Drizzle-Schema: [../src/lib/storage/schema.ts](../src/lib/storage/schema.ts)

---

## 8. Events und Live-Logs

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

## 9. Test-Strategie

Unit (Vitest):
- deterministische Scoring-/Research-Module
- Guardrails, Schema, Persistenzregeln
- Phase-6C Tests fuer trade_setup, advisor, terminal-density, missing-data-inline, no-recompute

E2E (Playwright):
- smoke path fuer zentrale App-Flows

---

## 10. Betriebsregeln

- Keine erfundenen Zahlen im Produktivpfad.
- Kein Ueberschreiben historischer Reports (immutable runs).
- Secrets werden in Logs/URLs redacted persistiert.
- Technische Abruffehler werden als run_integrity sichtbar gemacht.
