/**
 * LLM prompts for the research pipeline.
 *
 * Output convention: always a single JSON object, no Markdown.
 */
import type { BlockKey } from "@/lib/scoring/weights";
import { formatBlockRubric } from "@/lib/research/rubric";

export const SECTION_BLOCKS = [
  { id: "growth_market", label: "A - Growth & Market", maxWeight: 18 },
  { id: "unit_economics_margins", label: "B - Unit Economics & Margins", maxWeight: 14 },
  { id: "quality_moat", label: "C - Quality & Moat", maxWeight: 18 },
  { id: "valuation", label: "D - Valuation", maxWeight: 14 },
  { id: "capital_discipline_dilution", label: "E - Capital Discipline & Dilution", maxWeight: 12 },
  { id: "catalysts_revisions_sentiment", label: "F - Catalysts, Revisions, Sentiment", maxWeight: 12 },
  { id: "risk_fragility", label: "G - Risk & Fragility", maxWeight: 12 },
] as const;

export type BlockId = (typeof SECTION_BLOCKS)[number]["id"];

const COMMON_RULES = `Regeln:
- Antworte ausschliesslich mit einem einzigen JSON-Objekt. Kein Markdown, keine Kommentare.
- Wenn ein Wert nicht aus dem Kontext belegbar ist: setze \`null\` oder "unknown". Erfinde NICHTS.
- Jede Aussage MUSS auf eine Quelle aus der Quellenliste verweisen (sourceIdx).
- sourceIdx muss eine vorhandene Nummer aus # QUELLEN sein; wenn die Quelle den Sachverhalt nicht enthaelt, setze sourceIdx=null.
- Verwende ausschliesslich den bereitgestellten Kontext.`;

export const EXTRACTOR_SYSTEM = `Du bist ein nuechterner Finanzdaten-Extraktor.
Deine Aufgabe: aus dem Kontext (Suchergebnisse, EDGAR-Filings, Yahoo-Finance-Daten, RSS-News)
strukturierte Fakten extrahieren - ohne Interpretation.
${COMMON_RULES}`;

export const EXTRACTOR_USER = (ticker: string, context: string) => `TICKER: ${ticker}
KONTEXT:
${context}

Berechnete Kennzahlen mit Feldern wie derived_rule_of_40, derived_revenue_cagr_3y,
derived_share_count_growth_yoy oder derived_net_debt_to_ebitda wurden bereits deterministisch
berechnet. Uebernimm sie, wenn vorhanden; rechne diese Werte nicht selbst.

Extrahiere ein JSON mit folgender Struktur (key_metrics, identity, sources):
{
  "company_name": string|null,
  "isin": string|null,
  "exchange": string|null,
  "sector": string|null,
  "industry": string|null,
  "key_metrics": {
    "revenue_growth_yoy": number|null,
    "revenue_cagr_3y": number|null,
    "gross_margin": number|null,
    "operating_margin": number|null,
    "fcf_margin": number|null,
    "roic": number|null,
    "rule_of_40": number|null,
    "rule_of_x": number|null,
    "share_count_growth_yoy": number|null,
    "sbc_to_revenue": number|null,
    "net_debt_to_ebitda": number|null,
    "beta": number|null,
    "ntm_pe": number|null,
    "ev_sales": number|null,
    "ev_gross_profit": number|null,
    "peg": number|null
  },
  "facts": [{ "field": string, "value": any, "sourceIdx": number }]
}`;

export const SECTION_SYSTEM = `Du bist ein Senior Equity-Analyst.
Aufgabe: Bewerte den Block anhand der festen research.md-Rubrik.
Jede Indikator-Bewertung ist ein normierter Score von 0 bis 10 und benoetigt eine kurze Begruendung (max 10 Woerter) sowie sourceIdx.
Nutze die vorgegebenen indicator.name Keys exakt; erfinde keine neuen Indikatornamen.
${COMMON_RULES}`;

export const SECTION_USER = (block: { id: string; label: string }, ticker: string, context: string) =>
  `BLOCK: ${block.label}
TICKER: ${ticker}
${formatBlockRubric(block.id as BlockKey)}

KONTEXT:
${context}

Liefere JSON:
{
  "block": "${block.id}",
  "indicators": [
    { "name": string, "score": number|null, "rationale": string, "sourceIdx": number|null }
  ],
  "confidence": "low"|"medium"|"high",
  "red_flags": [string],
  "hard_blockers": [string],
  "moat_rating": "Wide"|"Narrow"|"Emerging"|"No Moat"|"Negative Trend"|"Unknown"|null,
  "moat_evidence": [string],
  "moat_threats": [string]
}`;

export const SUMMARY_SYSTEM = `Du bist ein praeziser Investment-Berichts-Autor.
Schreibe konzentriert; Stil: nuechtern, faktenbasiert, ohne Marketing-Sprache.
${COMMON_RULES}`;

export const SUMMARY_USER = (
  ticker: string,
  category: string,
  scoreTotal: number,
  context: string,
) => `TICKER: ${ticker}
KATEGORIE: ${category}
SCORE: ${scoreTotal}/100
KONTEXT:
${context}

Liefere JSON:
{
  "thesis_summary": string,
  "bull_case": [string, string, string],
  "bear_case": [string, string, string],
  "catalysts": [string],
  "open_questions": [string],
  "falsification_tests": [string]
}`;

// ---------------------------------------------------------------------------
// Red-Team Agent (Phase C)
// ---------------------------------------------------------------------------
export const REDTEAM_SYSTEM = `Du bist ein kritischer Red-Team-Analyst.
Deine Aufgabe: Finde die STÄRKSTEN Gegenargumente zur Investmentthese.
Sei skeptisch, nicht destruktiv. Arbeite faktenbasiert.
${COMMON_RULES}`;

export const REDTEAM_USER = (
  ticker: string,
  category: string,
  scoreTotal: number,
  bullCase: string[],
  keyMetricsSummary: string,
  context: string,
) => `TICKER: ${ticker}
KATEGORIE: ${category} | SCORE: ${scoreTotal}/100

BULL-CASE (zu hinterfragen):
${bullCase.map((b, i) => `${i + 1}. ${b}`).join("\n")}

QUANTITATIVE KENNZAHLEN (Fakten):
${keyMetricsSummary}

KONTEXT (für Belege):
${context}

Analysiere die Bull-Case-Argumente kritisch.
Identifiziere: falsche Annahmen, cherry-picking, strukturelle Risiken, blinde Flecken.
Schätze die realistische Eintrittswahrscheinlichkeit der Bull-Case-Szenarien.

Liefere JSON:
{
  "bear_arguments": [
    {
      "argument": string,
      "rebuttal_of": string,
      "severity": "low"|"medium"|"high",
      "probability": number,
      "sourceIdx": number|null
    }
  ],
  "overlooked_risks": [string],
  "stress_test": {
    "revenue_growth_halved": string,
    "margin_compression_5ppt": string,
    "multiple_contraction_30pct": string
  },
  "final_verdict": string,
  "confidence": "low"|"medium"|"high"
}`;
