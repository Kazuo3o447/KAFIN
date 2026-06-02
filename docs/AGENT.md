# AGENT.md

> **Pflicht:** Jede Änderung an Prompts, Modell-Defaults, Temperaturen, JSON-Schemas oder Agenten-Regeln muss hier eingetragen werden — gemeinsam mit dem Code-Change. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

---

## 1. Geltungsbereich

Die App unterstützt drei LLM-Provider: **LM Studio** (lokal), **DeepSeek** (Cloud-API) und **Groq** (Cloud-Inferenz-API). Der aktive Provider wird in den Einstellungen konfiguriert und per `src/lib/llm/config.ts` gelesen. Alle Aufrufe laufen durch `chatJSON()` in `ollama.ts`, das transparent zwischen LM Studio, DeepSeek und Groq routet. Alle Calls werden in `data/logs/audit.jsonl` protokolliert.

Fachliche Grundlage: [research.md](../research.md), insbesondere §7 (Evidenzklassen), §9–§20 (Scoring/Gate), §21 (Output-Schema), §22 (verbindlicher Agenten-Prompt).

## 0. Datenintegritaet (Grundregel)

- Mock-Daten sind im Produktivpfad verboten: keine erfundenen Zahlen, keine Platzhalterwerte wie numerische Fallbacks, keine Peer-Substitution als Ersatz fuer eigene Daten.
- Herkunft ist Schema-Invariante: `Tracked`-Werte mit `value !== null` brauchen gueltige Provenance inkl. `url` und `asOf`, sonst Validierungsfehler.
- LLM-Grenze: Analyst-Layer schreibt keine numerischen Felder. Deterministische Numerik bleibt vor/nach Analyst-Schritt bit-identisch.
- Modell-Annahmen sind zentral in `src/lib/research/assumptions.ts` gepflegt und im Report als Abschnitt `Annahmen` sichtbar.
- Jeder getrackte Wert traegt `kind`: `actual | estimate | derived | assumption`.
- Seed-/Demo-/Fixture-Daten sind nur in `tests/` erlaubt.
- Daten-Wasserfall: pro Capability feste Reihenfolge; nach Erschoepfung wird `null` + nicht beurteilbar ausgegeben, nie aufgefuellt.

### 0.2 KORREKTUR-02: Resilienz, Versionierung, Konsistenz

- Fehlende Werte und Capability-Ergebnisse tragen einen expliziten Status: `available | not_reported | not_applicable | fetch_failed | rate_limited | stale`.
- `fetch_failed` und `rate_limited` gelten als technischer Laufabbruch auf Datenebene, nicht als fachliche Nicht-Existenz von Daten.
- Report-Bannerpflicht: bei technischen Abruffehlern wird `run_integrity.incomplete_due_to_technical_fetch_errors=true` gesetzt und ein Retry explizit empfohlen.
- Reports sind immutable Audit-Artefakte; Re-Runs erzeugen stets neue `runId`/neue Report-Dateien, ohne Ueberschreiben historischer Ergebnisse.
- Jeder Report persistiert Audit-Metadaten: `audit_snapshot.codeVersion`, `thresholdSetVersion`, `assumptionsVersion`, `dataSnapshotId`, `providerVersions`, `runAt`.
- Schwellen sind versioniert in `src/lib/research/thresholds.ts` (`version`, `changelog`), Annahmen in `src/lib/research/assumptions.ts` (`ASSUMPTIONS_VERSION`).
- Anzeige-Modus ist explizit: Standard `as_was`; optionaler Re-Score wird als solcher gekennzeichnet.
- Provider-Konflikte werden deterministisch aufgeloest (Praezedenzregel), als Konflikt sichtbar gemacht (`data_quality.coverage.conflictingMetrics`) und auditierbar gespeichert.
- Kritische Kennzahlen sind linsenspezifisch definiert (`src/lib/scoring/critical-metrics.ts`); fehlende Kritikalitaet deckelt Confidence und fuellt `missingCriticalMetrics`.
- Leasing-/Debt-Konvention: Interest-Bearing-Leverage schliesst Operating-Leases aus; NetDebt/EBITDA folgt dieser Definition konsistent.
- FX-Normalisierung ist periodenbezogen (falls vorhanden `PAIR@YYYY-MM-DD`, sonst Pair-Fallback).
- Secrets-Hygiene: Audit- und Source-URLs werden tokenbereinigt gespeichert (`sanitizeUrlForAudit`), keine API-Keys in Artefakten/Logs.


### 1.1 Datenbeschaffung (Phase-1 Vertrag)

- Faktenkern läuft über `CompanyDataset`/`MarketContext` (Zod-Vertrag in `src/lib/schemas/dataset.ts`).
- Capability-basierte Provider-Runtime über `DataProviderV2` (`src/lib/providers/types.ts`) und Registry in `src/lib/providers/index.ts`.
- Sammler: `src/lib/providers/collect.ts` mit degradierender Capability-Kette (Primär/Fallback), paralleler Ausführung unabhängiger Capabilities und Raw-Persistenz unter `data/raw/{TICKER}/{runId}/`.
- Jeder skalare Fakt trägt Provenance (`source`, `url`, `klass`, `asOf`, `stale`).
- Capability-Laufdiagnostik wird pro Run persistiert (`fetch_statuses`) inkl. Provider-Reihenfolge, Retries und Fehlermeldungen.
- Retries mit Backoff sind Pflicht vor finalem `fetch_failed`/`rate_limited`-Status.
- **`news_sentiment`-Capability (Finnhub):** `NewsSentimentSchema` (`score`, `bullishPct`, `bearishPct`, `buzz`, `articlesInLastWeek`, `provenance`). Rubric-Funktion `news_sentiment_quality` wertet primär `score` aus (±0.2-Bänder → 8/6/4/2 Punkte); Fallback auf `beatStreak` wenn kein Sentiment vorhanden. Abfrage gegen `GET /news/sentiment?symbol={ticker}&token={key}`.
- **Verbindlich:** Kein LLM erzeugt Kennzahlen, Scores, Fair Values oder Schwellenentscheidungen im Datenpfad. LLM ist dort nicht autorisiert, Zahlen zu fabrizieren.

### 1.2 Kanonische Scoring-Taxonomie

- Scoring-Bloecke (kanonisch, 1:1 zu Matrix-Dimensionen):
  - `growth_market`
  - `unit_economics_margins`
  - `quality_moat`
  - `valuation`
  - `capital_discipline_dilution`
  - `catalysts_revisions_sentiment`
  - `ownership_smart_money`
  - `risk_fragility`
- Block↔Dimension-Mapping ist 1:1 in `src/lib/scoring/taxonomy.ts` definiert.
- Timing/Regime bleibt orthogonale Achse und ist explizit kein Fundamental-Block.

#### Paid-Upgrade-Pfad (dokumentiert, nicht implementiert)

- Free-now / paid-later bleibt Provider-agnostisch: Wechsel auf bezahlte globale Provider (z. B. EODHD/FMP-Paid für bessere internationale Ownership/Fundamentals) erfolgt ausschließlich über API-Key + Capability-Priorität, ohne Re-Engineering des Sammlers.
- Für Non-US bleiben Insider/13F aktuell bewusst lückenhaft und werden über Coverage ausgewiesen statt geschätzt.

---

## 2. Modell-Auswahl

- Provider und Modell werden **ausschließlich in den Einstellungen** (`/settings`) konfiguriert — kein Override im Run-Dialog.
- **LM Studio:** Ruft `GET {LM_STUDIO_BASE_URL}/v1/models`, cached 30 s, filtert Vision/Embedding-Modelle heraus, nimmt das erste Text-LLM als Default.
- Base-URL-Aufloesung lokal: `LLM_BASE_URL` > `LM_STUDIO_BASE_URL` > Fallback (`http://localhost:1234`).
- **DeepSeek:** API-Key und Modellname (`deepseek_model`, Default `deepseek-chat`) aus Settings-DB.
- **Groq:** API-Key und Modellname (`groq_model`, Default `meta-llama/llama-4-scout-17b-16e-instruct`) aus Settings-DB. Retry/Backoff bei transienten Fehlern; bei 429 wird der `Retry-After`-Header ausgewertet und exakt so lange gewartet (max. 90 s). Kein Modell-Fallback — stabiler Single-Endpoint.
- `src/lib/llm/config.ts` liest Provider-Config aus DB mit 10 s-Cache. Änderungen in Settings invalidieren den Cache sofort.

---

## 3. Agenten-Rollen

### 3.1 Extractor (Step 4a, parallel zu Section-Answerer)

**Zweck:** Aus Rohdaten (Yahoo Finance, EDGAR, FMP/AV, RSS-Snippets) eine strukturierte Fakten-Tabelle erzeugen. Keine Bewertung, keine Interpretation.

- **Modell:** `modelExtract` (aus Settings)
- **Temperature:** `0.1`
- **Format:** `json` (strict)
- **System-Prompt-Kern:**
  > Du bist ein Fakten-Extraktor. Du beantwortest ausschließlich auf Basis der bereitgestellten Quellen. Fehlende Werte → `null`. Erfinde keine Zahlen, keine URLs, keine Zitate. Jede Aussage bekommt eine Quelle aus der mitgelieferten Quellenliste (Index-Referenz).

- **Output-Schema (Zod):** `company_name`, `isin`, `exchange`, `sector`, `industry`, `key_metrics` (alle 16 Felder), `facts[]`. ISIN wird nach Extraktion via `normalizeIsin()` validiert; Fallback: Regex-Suche in allen Provider-Fakten via `extractIsinFromFacts()`.

### 3.2 Section-Answerer (Step 4b, deterministisch)

**Zweck:** Pro Score-Block deterministische Indikator-Bewertung aus `CompanyDataset`/`MarketContext` berechnen. Kein LLM-Call im Scoringpfad.

- **Engine:** `src/lib/scoring/engine.ts` + `src/lib/scoring/rubric-fn.ts`
- **Lenses:** `quality_compounder` und `emerging_winner` (beide berechnet, primär persistiert: `quality_compounder`)
- **Output:** je Indikator `score`, `reason`, `inputs`; je Lauf `valuation_regime`, `fair_value_corridor`, `inflection_flags`, `ownership_score`, `aaqs_binary`, `stability_scores`.
- **Verbindlich:** Kein `chatJSON` für Section-Scoring oder Gate-Entscheidungen.

### 3.3 Scorer (deterministisch, **kein** LLM)

- TypeScript-Modul `lib/scoring/`. 
- Wendet Gewichte aus `research.md` §9.1 an, summiert auf 0–100.
- Setzt **Gate** (Green/Yellow/Red) nach §20.1 (Schwellen Score≥70, keine Hard-Blocker, Confidence ≥ medium, Kategorie nicht Hype/Risk etc.).
- Wählt **Kategorie** (`Rocket | Quality Growth | Transitional | Hype/Risk | Dilution Trap | Broken Growth | Too Hard | Ignore`) deterministisch im Engine/Gate-Pfad.
- Nutzt Trust-Layer-v2-Regeln: Metric-Applicability, deterministische Indicator-Overrides, Confidence-Caps, Hard-Blocker-Policy und Output-Sanitizer.
- Darf den Gesamtscore auf `null` setzen, wenn kritische Datenabdeckung zu niedrig ist (defensiver Fail-Safe).
- Phase 6 ergänzt sektor-relative Baselines, Combo-Signale, deterministische Confidence und Score-Historie, ohne den Score selbst zu externalisieren.

### 3.6 Timing & Regime (Phase 3, deterministisch)

**Kardinalregel:** Timing/Regime sind eine orthogonale Achse und verändern niemals den Fundamental-Score.

- Technicals: `src/lib/research/technicals.ts` (MA/RSI/MACD/RS/Beta/Volatilität/OBV).
- Marktregime: `src/lib/research/regime.ts` (`risk_on|neutral|risk_off`, inkl. `breadthIsProxy`-Kennzeichnung bei Proxy-Breadth).
- Timing-Achse: `src/lib/scoring/timing.ts` (Timing-Score, Quadrant, regime-bewusste `actionRecommendation`).
- Orchestrator-Step: `stepComputeTimingAxis` nach Fundamental-Scoring.
- **Verboten:** Kein LLM-Aufruf im Timing/Regime/Technicals-Pfad.

### 3.12 Phase-6 Reporting-Erweiterungen

- Report-Persistenz schreibt zusätzlich `market_context`, `sector_baseline_used`, `combo_flags`, `confidence_score` und `score_trend`.
- Score-Historie wird pro Report in `score_history` persistiert und im Dashboard als Trend-Sparkline angezeigt.
- Das Dashboard zeigt Marktregime, Breadth, VIX, High-Yield-Spread, Fair-Value-Korridor, Timing, Confidence und aktive Combo-Signale.

### 3.13 Phase-6C Trader-Terminal & Beraterlayer

- Trade-Setup ist deterministisch (`src/lib/research/trade-setup.ts`) und liefert `entry_zone_max`, `stop_ref`, `risk_reward`, `action`, `sizing_hint`.
- Trade-Setup-Werte sind im Report Pflichtblock `trade_setup` und werden unveraendert aus der Deterministik in UI/Export uebernommen.
- KI-Beraterlayer liefert Interpretation statt Rechenlogik: `thesis`, `numbersSay`, `bullCase`, `bearCase`, `catalystNote`, `entryTrigger`, `exitWatchTrigger`.
- Guardrails erzwingen: Trigger-Zahlen duerfen nur auf deterministischem `trade_setup` aufbauen; keine numerische Neuberechnung durch den LLM-Text.
- UI-Prinzip fuer Reports: terminal-dicht, scanner-freundlich, keine verpflichtenden Akkordeons fuer Kerninfos (Setup, Verdikt, Regime, Kennzahlen, Trigger immer sichtbar).
- Differenzierung: Die App gibt keine generischen Story-Karten aus, sondern ein umsetzungsnahes Trade-Setup mit klaren Triggern und Quellenbezug.

### 3.7 Sektor-Routing (Retrofit zu Phase 2)

- Router: `src/lib/scoring/sector-router.ts`.
- Klassifikation: `industrial_software | financials | reit | insurance | biotech_pre_revenue | commodity_cyclical`.
- Bei inkompatiblen Klassen wird `notScorableWithStandardRubric=true` + deterministische Begründung gesetzt.
- Standardrubrik darf in diesen Fällen keinen scheinpräzisen Fundamental-Score liefern.

### 3.8 Reporting-Politik (Retrofit zu Phase 1)

- Normalisierung vor Metrics/Scoring via `src/lib/research/normalization.ts`.
- Reporting-Währung wird explizit geführt (`reporting_currency`), Originalwährung bleibt nachvollziehbar.
- TTM wird aus den letzten vier Quartalen gebildet (fiskalperiodenbasiert).
- GAAP bleibt Score-Basis; Adjusted-Werte werden separat unter `gaap_vs_adjusted` geführt, nie vermischt.

### 3.9 LLM nur als Interpret (Phase 4)

- LLM darf interpretieren, niemals Fakten/Score/Fair-Value/Gate/Quadrant erzeugen oder überschreiben.
- Analyst-Output lebt ausschließlich im `analyst`-Block des Reports und ist für Deterministik bewusst orthogonal.
- `analyst` ist **nicht reproduzierbar** und als `isInterpretation=true` gekennzeichnet.

### 3.10 Guardrails (Pflicht im Analyst-Layer)

- Zahlenabgleich gegen deterministischen Report (`analyst_number_tolerance`): nicht gedeckte Zahlen werden entfernt.
- Katalysator-Anker: `confirmed` nur mit quantitativer Verankerung im Report, sonst `speculative`.
- Score-/Gate-/Fair-Value-Behauptungen im Analyst-Text sind unzulässig und werden neutralisiert.
- `groundingFacts` listet genutzte deterministische Felder auditierbar auf.

### 3.11 Optionalität und Ausfallsicherheit

- Analyst-Schritt ist optional und nicht-blockierend.
- Bei deaktiviertem LLM, fehlender Konfiguration oder Laufzeitfehlern wird `analyst=null` gesetzt.
- Der deterministische Report bleibt vollständig nutzbar.

### 3.4 Summarizer (Step 6)

**Zweck:** Bull-Case, Bear-Case, Thesis-Summary, Open Questions, Falsification Tests.

- **Modell:** `modelSummary` (aus Settings)
- **Temperature:** `0.4`
- **Format:** `json` (strict, gegen `report.summary`-Slice validiert)
- Hinweis zum Ist-Stand: Die legacy-Funktion `stepSummarize` ist aktuell als kompatibler No-Op exportiert; relevante Textinterpretation laeuft ueber den optionalen Analyst-Layer.
- **System-Prompt-Kern:**
  > Schreibe nüchtern, ohne Marketing-Sprache. Bull/Bear je 3–6 Bulletpoints, jede mit Quellen-Index. Thesis ≤ 80 Wörter. Open Questions sind echte Datenlücken, keine rhetorischen Fragen. Falsification Tests = überprüfbare Bedingungen, die die These widerlegen würden.

### 3.5 Red-Team (Phase 2, nicht im MVP)

- Zweiter LLM-Pass auf den fertigen Report.
- Pflicht ab `score_total ≥ 90` (siehe `research.md` §18).
- Temperatur `0.6`. Liefert `critique[]` mit Belegen aus `source_list`.

---

## 4. Verbindliche Regeln (auf jeden Prompt vererbt)

Aus `research.md` §22:

1. Jede These ist Hypothese, nie Wahrheit.
2. Primärquellen bevorzugt: 10-K, 10-Q, 8-K, IR, Earnings Releases, Transkripte.
3. Keine erfundenen Kennzahlen. Fehlend = `unknown`.
4. Harte Zahlen ≠ Management-Narrative.
5. Keine finalen Scores im LLM. Nur Sub-Indikatoren + Begründungen.
6. Immer prüfen: Verwässerung, SBC, Share Count Trend, FCF-Qualität.
7. Wachstum-Qualität: organisch, wiederkehrend, profitabel, verteidigbar.
8. Moat qualitativ + quantitativ.
9. Kategorien gemäß §17 streng anwenden, `Too Hard` aktiv nutzen.
10. Aktiv nach Gegenargumenten und Falsifikationsbedingungen suchen.

---

## 5. JSON-Schema-Validierung

- Zentrale Zod-Schemas in `src/lib/schemas/`. Master-Schema `report.ts` ist 1:1 Abbild von `research.md` §21.
- **Pipeline:** LLM-Antwort → `parseRobustJSON` (Markdown-Strip + Bracket-Repair, portiert aus Pilot) → `schema.parse()`.
- Bei Validierungs-Fehler: ein Retry mit Repair-Prompt (`"Deine letzte Antwort war kein gültiges JSON gemäß folgendem Schema: … Liefere ausschließlich JSON."`). Bei zweitem Fehler → `run.status = failed`, kein Silent-Fallback.

---

## 6. Audit-Log-Format

`data/logs/audit.jsonl` — eine Zeile pro Ereignis:

```json
{"ts":1716200000,"runId":"01HZ…","step":"extract","model":"llama3.1:8b-instruct","temperature":0.1,
 "promptHash":"sha256:…","promptPath":"data/raw/NVDA/01HZ…/prompts/extract.md",
 "responsePath":"data/raw/NVDA/01HZ…/responses/extract.json",
 "tokensIn":2310,"tokensOut":612,"ms":4821,"ok":true}
```

Erweitert (Update 12):
- `provider`, `requestedModel`, `model` (effektives Modell), optionale `rateLimit`-Metadaten und `systemFingerprint`.
- Pipeline-State schreibt zusätzlich einen Step-Trail (`effectiveModels`, `llmCalls`) in den Report-Ausgabe-Kontext.

Niemals Klartext-Secrets, niemals API-Keys, niemals Roh-PII loggen.

---

## 7. Änderungs-Workflow für Prompts

1. Prompt-Datei in `src/lib/llm/prompts/*.md` editieren.
2. Schema in `src/lib/schemas/` synchronisieren, falls Output sich ändert.
3. Snapshot-Tests neu aufnehmen (`tests/unit/prompts/*.snap`).
4. Eintrag in [STATUS.md](STATUS.md) (Changelog-Block) **und** hier in §3 anpassen.
5. Version-Bump des Prompts (Header `version: x.y`) → wird ins Audit-Log geschrieben.

---

## 8. Verbotene Modell-Verhalten

- Kein Web-Browsing aus dem Modell heraus (kein Tool-Use im MVP).
- Keine Kursprognosen, keine Kursziele, keine Empfehlungen zu Kauf/Verkauf.
- Keine PII-Generierung über Personen außerhalb der gelieferten Quellen.
- Keine Spekulation über laufende Rechtsverfahren über das hinaus, was in Filings steht.
