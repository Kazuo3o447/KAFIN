# AGENT.md

> **Pflicht:** Jede Änderung an Prompts, Modell-Defaults, Temperaturen, JSON-Schemas oder Agenten-Regeln muss hier eingetragen werden — gemeinsam mit dem Code-Change. Siehe [MANIFEST.md §8](MANIFEST.md#8-pflichten-zur-dokumentations-pflege).

---

## 1. Geltungsbereich

Die App nutzt ein **lokales LLM via Ollama**. Es gibt mehrere Agenten-Rollen, die nacheinander in einer Pipeline laufen. Jede Rolle hat: festen Prompt, festes Output-Schema (Zod), Temperatur, Modell-Default. Alle Aufrufe werden in `data/logs/audit.jsonl` protokolliert.

Fachliche Grundlage: [research.md](../research.md), insbesondere §7 (Evidenzklassen), §9–§20 (Scoring/Gate), §21 (Output-Schema), §22 (verbindlicher Agenten-Prompt).

---

## 2. Modell-Auswahl

- Die App ruft beim Start `GET {OLLAMA_BASE_URL}/api/tags` und cached die Liste 30 s.
- UI zeigt Dropdown in `Settings` (globale Defaults) **und** im `Run`-Dialog (per-Step Override).
- Empfohlene Defaults (anpassbar): jedes instruct-tuned Modell ≥ 7B mit JSON-Mode-Support, z. B. `llama3.1:8b-instruct`, `qwen2.5:14b-instruct`, `mistral-nemo`, `gpt-oss:20b`.
- **Pflicht:** Modell muss `format=json` zuverlässig respektieren. Bei wiederholten Schema-Fehlern wird das Modell im Log markiert und im UI gewarnt.

---

## 3. Agenten-Rollen

### 3.1 Extractor (Step 3)

**Zweck:** Aus Rohdaten (yfinance, EDGAR, FMP/AV, RSS-Snippets) eine strukturierte Fakten-Tabelle erzeugen. Keine Bewertung, keine Interpretation.

- **Modell:** `DEFAULT_MODEL_EXTRACT`
- **Temperature:** `0.1`
- **Format:** `json` (strict)
- **System-Prompt-Kern:**
  > Du bist ein Fakten-Extraktor. Du beantwortest ausschließlich auf Basis der bereitgestellten Quellen. Fehlende Werte → `"unknown"`. Erfinde keine Zahlen, keine URLs, keine Zitate. Jede Aussage bekommt eine Quelle aus der mitgelieferten `sources`-Liste (Index-Referenz).

- **Output-Schema (Zod):** Teilmenge von `research.md` §21 — `key_metrics` + `source_list` + `confidence_per_metric`.

### 3.2 Section-Answerer (Step 4, pro Block A–G)

**Zweck:** Pro Score-Block die Indikatoren bewerten (0–10 je Indikator) und je eine kurze Begründung mit Quelle liefern. **Vergibt keine Block-Summen** — die Gewichtung passiert deterministisch im Backend.

- **Modell:** `DEFAULT_MODEL_SCORING`
- **Temperature:** `0.2`
- **Format:** `json` (strict)
- **System-Prompt-Kern:**
  > Du bewertest Indikatoren nach `research.md`. Für jeden Indikator: Wert (0–10), 1–3 Sätze Begründung, Quellen-Index. Keine Block-Summen. Markiere Red-Flags. Wenn Datenlage `unknown`, vergib `null` und erkläre die fehlende Datenlage.

- **Parallelität:** max. 2 Blöcke gleichzeitig (Ollama-Auslastung).

### 3.3 Scorer (deterministisch, **kein** LLM)

- TypeScript-Modul `lib/scoring/`. 
- Wendet Gewichte aus `research.md` §9.1 an, summiert auf 0–100.
- Setzt **Gate** (Green/Yellow/Red) nach §20.1 (Schwellen Score≥70, keine Hard-Blocker, Confidence ≥ medium, Kategorie nicht Hype/Risk etc.).
- Wählt **Kategorie** (`Rocket | Quality Growth | Transitional | Hype/Risk | Dilution Trap | Broken Growth | Too Hard | Ignore`) nach Heuristik in `category.ts` (dokumentiert dort mit Verweis auf §17).

### 3.4 Summarizer (Step 6)

**Zweck:** Bull-Case, Bear-Case, Thesis-Summary, Open Questions, Falsification Tests.

- **Modell:** `DEFAULT_MODEL_SUMMARY`
- **Temperature:** `0.4`
- **Format:** `json` (strict, gegen `report.summary`-Slice validiert)
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
