/**
 * LLM prompts for interpretation layer (Phase 4).
 * Output convention: always a single JSON object, no Markdown.
 */

export const SECTION_BLOCKS = [
  { id: "growth_market", label: "A - Growth & Market", maxWeight: 18 },
  { id: "unit_economics_margins", label: "B - Unit Economics & Margins", maxWeight: 14 },
  { id: "quality_moat", label: "C - Quality & Moat", maxWeight: 18 },
  { id: "valuation", label: "D - Valuation", maxWeight: 14 },
  { id: "capital_discipline_dilution", label: "E - Capital Discipline & Dilution", maxWeight: 12 },
  { id: "catalysts_revisions_sentiment", label: "F - Catalysts, Revisions, Sentiment", maxWeight: 8 },
  { id: "ownership_smart_money", label: "G - Ownership & Smart Money", maxWeight: 8 },
  { id: "risk_fragility", label: "H - Risk & Fragility", maxWeight: 8 },
] as const;

export type BlockId = (typeof SECTION_BLOCKS)[number]["id"];

const COMMON_RULES = `Regeln:
- Antworte ausschliesslich mit einem einzigen JSON-Objekt. Kein Markdown, keine Kommentare.
- Wenn ein Wert nicht aus dem Report belegbar ist: schreibe keine Zahl.
- Verwende ausschliesslich den bereitgestellten Report- und Evidence-Kontext.
- Du erzeugst keine Scores, keine Gates, keine Fair Values, keine Quadranten.`;

export const SUMMARY_SYSTEM = `Du bist ein Equity-Analyst fuer Interpretation.
Du erklaerst deterministische Ergebnisse in klarer Prosa, ohne neue Zahlen zu erfinden.
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
  "thesis": string,
  "numbersSay": string,
  "bullCase": string,
  "bearCase": string,
  "catalystNote": string,
  "entryTrigger": string,
  "exitWatchTrigger": string,
  "chartReading": string,
  "catalysts": [
    { "text": string, "anchorMetric": string|null, "sourceUrl": string|null, "sourceDate": string|null }
  ]
}`;

// ---------------------------------------------------------------------------
// Red-Team Agent (Phase C)
// ---------------------------------------------------------------------------
export const REDTEAM_SYSTEM = `Du bist ein kritischer Red-Team-Analyst.
Pruefe die bereits formulierte These auf Schwachstellen und formuliere harte Gegenargumente.
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

Analysiere die Bull-Case-Argumente kritisch und liefere nur neue Bear-Counterpoints.

Liefere JSON:
{
  "bearCounterpoints": [string]
}`;

// ---------------------------------------------------------------------------
// Verdict-Detail (Phase F.2)
// ---------------------------------------------------------------------------
// KI Axis Judgment (P2) — Mauboussin-structured moat + Bull/Bear debate
// ---------------------------------------------------------------------------

/**
 * System prompt for the KI Axis Critic.
 * Produces a structured KiAxisJudgment JSON for a single axis.
 */
export const KI_AXIS_SYSTEM = `Du bist ein unabhaengiger Equity-Analyst mit Fokus auf fundamentale Qualitaetsbewertung.
Deine Aufgabe: Bewerte eine einzelne Achse (Growth / Finance / Moat) auf Basis der bereitgestellten
quantitativen Ergebnisse und Evidence-Quellen. Nutze Chain-of-Thought (Feld "cot") als Pflichtfeld.
${COMMON_RULES}
- Zusaetzlich verboten: qualitative Urteile ohne Evidence-Beleg im "evidence"-Array.
- Jede claim-haltige Aussage in "evidence" muss als Objekt mit "claim" und "sourceRef" angegeben werden.`;

export const KI_AXIS_USER = (
  ticker: string,
  axis: "growth" | "finance" | "moat",
  quantValue: number | null,
  quantCoverage: number,
  deterministicSummary: string,
  evidenceContext: string,
) => `TICKER: ${ticker}
ACHSE: ${axis.toUpperCase()}
QUANT_SCORE: ${quantValue !== null ? quantValue.toFixed(1) : "n/a"} / 100
QUANT_COVERAGE: ${(quantCoverage * 100).toFixed(0)}%

DETERMINISTISCHE_SIGNALE:
${deterministicSummary}

EVIDENCE_KONTEXT (Filings, News):
${evidenceContext}

Fuehre eine Chain-of-Thought-Analyse durch (Feld "cot") und liefere dann:

${axis === "moat" ? `Fuer Moat-Bewertung verwende den 4-Schritt Mauboussin-Prozess in "cot":
1. Branchenrenditeniveau: liegt die Kapitalrendite ueber oder unter den Kapitalkosten?
2. Moat-Quelle: Netzwerkeffekte / Wechselkosten / Immaterielle Assets / Kostenvorteile / Effizienter Scale?
3. Fade-Rate: Wie schnell erodiert der Moat?
4. Haltbarkeitsschaetzung: Wide (>20 Jahre) / Narrow (10-20 J.) / Emerging (<10 J.) / None?

` : ""}Liefere JSON:
{
  "cot": string,
  "ki_subscore": number,
  "confidence": number,
  "rating": string,
  ${axis === "moat" ? `"moatSource": string | null,
  "durabilityYears": number | null,` : ""}
  "evidence": [{ "claim": string, "sourceRef": string }],
  "threats": [string]
}

ki_subscore: 0-100 (entspricht Axis-Score-Skala).
confidence: 0.0-1.0 (wie gut deckt die Evidence die Einschaetzung ab?).
rating: kurzes Label, z.B. "Wide Moat", "Narrow Moat", "No Moat", "Growing Fast", "Slowing", "Stable Finance", "Leveraged", etc.
${axis === "moat" ? `moatSource: eine der Kategorien: "network_effect" | "switching_costs" | "intangibles" | "cost_advantage" | "efficient_scale" | null.
durabilityYears: beste Schaetzung in Jahren, oder null.` : ""}`;

// ---------------------------------------------------------------------------
export const VERDICT_DETAIL_SYSTEM = `Du formulierst eine einzelne, sachliche Erklaerung
zum Research-Verdict. Maximal 25 Woerter. Keine Adjektive wie "stark", "schwach", "exzellent"
ueber die Aktie selbst — beschreibe nur die Daten-Tatsachen.
Verbotene Woerter: kaufen, verkaufen, halten, target, Kursziel, Empfehlung, Buy, Sell, Hold, Strong Buy, Strong Sell.
Antworte ausschliesslich mit einem JSON-Objekt: { "detail": string }`;

export const VERDICT_DETAIL_USER = (input: {
  ticker: string;
  label: string;
  reasonCode: string;
  weakestBlock: string | null;
  topStrengths: string[];
  topConcerns: string[];
}) => `TICKER: ${input.ticker}
LABEL: ${input.label}
REASON_CODE: ${input.reasonCode}
SCHWAECHSTER_BLOCK: ${input.weakestBlock ?? "—"}
STAERKEN: ${input.topStrengths.join(", ")}
SORGEN: ${input.topConcerns.join(", ")}

Formuliere genau einen Satz (max 25 Woerter), der das Label inhaltlich begruendet.
Keine Kauf-/Verkaufs-Empfehlungen. Nur Daten-Tatsachen.
Liefere JSON: { "detail": string }`;
