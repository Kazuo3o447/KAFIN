/**
 * LLM-Prompts für die 4 Agent-Rollen aus docs/AGENT.md.
 * Halten sich an research.md (Vokabular der Score-Blöcke A–G,
 * Source-Klassen, Gates).
 *
 * Convention: Output ist IMMER ein einzelnes JSON-Objekt (kein Markdown).
 */

export const SECTION_BLOCKS = [
  { id: "growth_market", label: "A · Growth & Market", maxWeight: 18 },
  { id: "unit_economics_margins", label: "B · Unit Economics & Margins", maxWeight: 14 },
  { id: "quality_moat", label: "C · Quality & Moat", maxWeight: 18 },
  { id: "valuation", label: "D · Valuation", maxWeight: 14 },
  { id: "capital_discipline_dilution", label: "E · Capital Discipline & Dilution", maxWeight: 12 },
  { id: "catalysts_revisions_sentiment", label: "F · Catalysts, Revisions, Sentiment", maxWeight: 12 },
  { id: "risk_fragility", label: "G · Risk & Fragility", maxWeight: 12 },
] as const;

export type BlockId = (typeof SECTION_BLOCKS)[number]["id"];

const COMMON_RULES = `Regeln:
- Antworte ausschließlich mit einem einzigen JSON-Objekt. Kein Markdown, keine Kommentare.
- Wenn ein Wert nicht aus dem Kontext belegbar ist: setze \`null\` oder "unknown". Erfinde NICHTS.
- Jede Aussage MUSS auf eine Quelle aus der Quellenliste verweisen (sourceIdx).
- Verwende ausschließlich den bereitgestellten Kontext.`;

export const EXTRACTOR_SYSTEM = `Du bist ein nüchterner Finanzdaten-Extraktor.
Deine Aufgabe: aus dem Kontext (Suchergebnisse, EDGAR-Filings, Yahoo-Finance-Daten, RSS-News)
strukturierte Fakten extrahieren – ohne Interpretation.
${COMMON_RULES}`;

export const EXTRACTOR_USER = (ticker: string, context: string) => `TICKER: ${ticker}
KONTEXT:
${context}

Extrahiere ein JSON mit folgender Struktur (key_metrics, identity, sources):
{
  "company_name": string|null,
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
Aufgabe: Bewerte den Block aus research.md anhand seiner Indikatoren auf Skala 0–10.
Jede Indikator-Bewertung benötigt: Wert, kurze Begründung (max 2 Sätze), sourceIdx.
${COMMON_RULES}`;

export const SECTION_USER = (block: { id: string; label: string }, ticker: string, context: string) =>
  `BLOCK: ${block.label}
TICKER: ${ticker}
KONTEXT:
${context}

Liefere JSON:
{
  "block": "${block.id}",
  "indicators": [
    { "name": string, "score": number|null, "rationale": string, "sourceIdx": number|null }
  ],
  "confidence": "low"|"medium"|"high",
  "hard_blockers": [string]
}`;

export const SUMMARY_SYSTEM = `Du bist ein präziser Investment-Berichts-Autor.
Schreibe konzentriert; Stil: nüchtern, faktenbasiert, ohne Marketing-Sprache.
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
