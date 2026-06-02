import type { BlockKey } from "@/lib/scoring/weights";

export interface RubricIndicator {
  key: string;
  label: string;
  guidance: string;
  aliases?: string[];
}

export interface BlockRubric {
  id: BlockKey;
  researchSection: string;
  title: string;
  maxWeight: number;
  purpose: string;
  indicators: RubricIndicator[];
  scoringGuide: string[];
  redFlags: string[];
  hardBlockers?: string[];
  specialInstructions?: string[];
}

export const RESEARCH_BLOCK_RUBRIC: Record<BlockKey, BlockRubric> = {
  growth_market: {
    id: "growth_market",
    researchSection: "research.md Paragraph 10",
    title: "A - Growth & Market",
    maxWeight: 18,
    purpose: "Ist das Wachstum real, gross und nachhaltig?",
    indicators: [
      {
        key: "revenue_growth_quality",
        label: "Umsatzwachstum YoY / organische Qualitaet",
        guidance: "Bewerte Wachstumshoehe, Wiederholbarkeit und ob Wachstum organisch statt akquisitionsgetrieben ist.",
        aliases: ["revenue growth", "organic growth", "umsatzwachstum"],
      },
      {
        key: "revenue_cagr_3y",
        label: "Umsatz-CAGR 3 Jahre",
        guidance: "Bewerte die mehrjaehrige Wachstumskontinuitaet; Einjahres-Spikes ohne Historie sind schwach.",
        aliases: ["3y cagr", "cagr"],
      },
      {
        key: "customer_retention_expansion",
        label: "Kundenwachstum, Retention, NRR / Wachstum pro Kunde",
        guidance: "Nutze ARR/NRR, Kundenwachstum, Churn, Umsatz pro Kunde oder vergleichbare Belege.",
        aliases: ["nrr", "retention", "customer growth"],
      },
      {
        key: "tam_share_gain_evidence",
        label: "TAM-Penetration, Marktanteile, neue Produktlinien",
        guidance: "Bewerte, ob TAM/Share-Gain-Behauptungen durch Segmente, Kunden oder reale Penetration belegt sind.",
        aliases: ["tam", "market share", "share gains"],
      },
    ],
    scoringGuide: [
      "0-4/18 schwach: Wachstum unter Markt/Sektor oder ruecklaeufig.",
      "5-8/18 solide: 10-20% Wachstum, aber ohne klare Beschleunigung.",
      "9-13/18 stark: 20-40% Wachstum, organisch und wiederholbar.",
      "14-16/18 sehr stark: >40% Wachstum mit Kunden- und Segmentbelegen.",
      "17-18/18 aussergewoehnlich: >40% plus steigende Retention, Share Gains und neue TAM-Belege.",
    ],
    redFlags: [
      "Wachstum nur durch Akquisitionen.",
      "Wachstum durch Rabattierung.",
      "Sinkender Umsatz pro Kunde oder stark steigende Churn.",
      "Grosse Diskrepanz zwischen Bookings und Umsatz.",
      "Management spricht nur ueber TAM, nicht ueber reale Penetration.",
    ],
  },
  unit_economics_margins: {
    id: "unit_economics_margins",
    researchSection: "research.md Paragraph 11",
    title: "B - Unit Economics & Margins",
    maxWeight: 14,
    purpose: "Wird Wachstum effizienter oder teurer?",
    indicators: [
      {
        key: "gross_margin_quality",
        label: "Bruttomarge und Bruttomargenstabilitaet",
        guidance: "Bewerte absolute Bruttomarge und Stabilitaet im Verhaeltnis zum Geschaeftsmodell.",
        aliases: ["gross margin", "bruttomarge"],
      },
      {
        key: "operating_leverage",
        label: "Operating Leverage / operative Marge",
        guidance: "Bewerte, ob operative Marge, EBITDA-Marge oder Kostenquoten mit Skalierung besser werden.",
        aliases: ["operating margin", "ebitda margin", "operating leverage"],
      },
      {
        key: "fcf_efficiency",
        label: "FCF-Marge und Cash Conversion",
        guidance: "Bewerte FCF-Marge, Operating Cashflow und ob Reife in freien Cashflow uebersetzt wird.",
        aliases: ["fcf margin", "free cash flow"],
      },
      {
        key: "rule_of_40_x_20",
        label: "Rule of 40 / Rule of X / Rule of 20",
        guidance: "Nutze Rule of 40/X fuer SaaS/Cloud, Rule of 20 fuer IT-Services, nur wenn das Modell passt.",
        aliases: ["rule of 40", "rule of x", "rule of 20"],
      },
    ],
    scoringGuide: [
      "Hohe Scores nur, wenn Wachstum mit stabilen oder steigenden Margen einhergeht.",
      "SaaS/Cloud: ARR, NRR, GRR, Rule of 40/X, FCF-Marge und SBC besonders gewichten.",
      "Marketplace/Plattform: GMV, Take Rate, Netzwerkeffekte und Contribution Margin pruefen.",
      "Hardware/Halbleiter: Zyklusposition, Lagerbestand, CapEx und Auslastung einordnen.",
      "IT-Services: organisches Wachstum plus EBITA-Marge, Rule of 20.",
    ],
    redFlags: [
      "Umsatzwachstum steigt, aber Bruttomarge sinkt dauerhaft.",
      "Vertriebskosten wachsen schneller als Umsatz.",
      "FCF bleibt negativ trotz Reife.",
      "Rule of 40 wird nur durch Wachstum erfuellt, waehrend Burn eskaliert.",
      "Management ignoriert SBC.",
    ],
  },
  quality_moat: {
    id: "quality_moat",
    researchSection: "research.md Paragraph 12",
    title: "C - Quality & Moat",
    maxWeight: 18,
    purpose: "Ist die Rendite verteidigbar?",
    indicators: [
      {
        key: "moat_returns_composite",
        label: "Returns-Evidenz-Komposit (ROIC, Adj.ROIC, Fade-Rate)",
        guidance: "De-korreliertes Komposit aus ROIC-WACC-Spread, F&E-adjustiertem ROIC (Mauboussin) und ROIC-Fade-Rate. Gedeckelt bei 7/10 für rein quantitative Evidenz.",
        aliases: ["roic", "roic wacc", "adjusted roic", "returns on capital"],
      },
      {
        key: "durability_trend",
        label: "Dauerhaftigkeit und Trend",
        guidance: "Bewerte, ob der Vorteil 10+ Jahre haltbar wirkt oder durch Wettbewerb, KI, Regulierung oder Kosten erodiert.",
        aliases: ["durability", "trend", "competition", "commoditization"],
      },
      {
        key: "moat_source_evidence",
        label: "Moat-Quelle belegt (KI-Qualitätsurteil)",
        guidance: "Pruefe Netzwerkeffekt, Wechselkosten, immaterielle Assets, Kostenvorteil oder effiziente Skalierung.",
        aliases: ["moat", "network effect", "switching cost", "intangible assets", "cost advantage"],
      },
      {
        key: "business_quality_returns",
        label: "Kapitalrendite und Planbarkeit",
        guidance: "Bewerte Qualitaet aus ROIC/ROE, Wiederkehr, Margenstabilitaet, Kundendiversifikation und Reinvestitionsfaehigkeit.",
        aliases: ["quality", "returns", "planbarkeit"],
      },
    ],
    scoringGuide: [
      "Wide Moat: Vorteil plausibel >20 Jahre haltbar.",
      "Narrow Moat: Vorteil plausibel 10-20 Jahre haltbar.",
      "Emerging Moat: Vorteil erkennbar, aber noch nicht bewiesen.",
      "No Moat: kein belastbarer Vorteil.",
      "Negative Trend: Vorteil wird durch Wettbewerb, KI, Regulierung oder Kosten zerstoert.",
    ],
    redFlags: [
      "Hohe Bruttomargen ziehen aggressive Wettbewerber an.",
      "Produkt ist leicht kopierbar.",
      "Wachstum haengt von einem einzelnen Vertriebskanal ab.",
      "Kundenkonzentration >30% bei einem Kunden.",
      "Moat basiert nur auf Management-Narrativ.",
      "KI oder Open Source koennte das Produkt commoditisieren.",
    ],
    specialInstructions: [
      "Gib zusaetzlich moat_rating aus: Wide | Narrow | Emerging | No Moat | Negative Trend | Unknown.",
      "Gib moat_evidence und moat_threats als kurze Listen aus, jeweils mit Quellenbezug in den Rationale-Texten.",
    ],
  },
  valuation: {
    id: "valuation",
    researchSection: "research.md Paragraph 13",
    title: "D - Valuation",
    maxWeight: 14,
    purpose: "Ist die Aktie fuer die These plausibel bewertet?",
    indicators: [
      {
        key: "growth_adjusted_multiple",
        label: "Multiple relativ zu Wachstum",
        guidance: "Bewerte Forward P/E, EV/Sales, EV/Gross Profit, EV/EBITDA, EV/FCF oder PEG gegen Wachstum.",
        aliases: ["ev sales", "ntm pe", "peg", "multiple"],
      },
      {
        key: "historical_relative_valuation",
        label: "Historische und relative Bewertung",
        guidance: "Vergleiche mit eigener Historie, Sektor und Peers; vermeide reine Kursziel-Argumente.",
        aliases: ["historical valuation", "peer"],
      },
      {
        key: "expectation_risk",
        label: "Implizite Erwartungen / Reverse-DCF-Logik",
        guidance: "Bewerte, ob der Kurs perfekte Ausfuehrung oder unwahrscheinliche Wachstums-/Margenannahmen verlangt.",
        aliases: ["expectations", "reverse dcf", "margin of safety"],
      },
    ],
    scoringGuide: [
      "Nicht teuer, weil ein Multiple hoch ist; teuer, wenn die Erwartungen unwahrscheinlich hoch sind.",
      "Nutze mindestens relative Bewertung, historische Bewertung und Erwartungsanalyse, sofern belegt.",
      "Hohe Scores brauchen plausible Bewertung im Verhaeltnis zu Wachstum, Moat und Cashflow.",
    ],
    redFlags: [
      "Bewertung impliziert perfekte Ausfuehrung.",
      "Multiple expandierte schneller als fundamentale Kennzahlen.",
      "Umsatzwachstum verlangsamt sich bei gleichbleibender Bewertung.",
      "Analystenrevisionen fallen, aber Multiple bleibt hoch.",
      "Keine Margin of Safety.",
      "Nur Kursziel-Argumentation ohne Cashflow-Logik.",
    ],
  },
  capital_discipline_dilution: {
    id: "capital_discipline_dilution",
    researchSection: "research.md Paragraph 14",
    title: "E - Capital Discipline & Dilution",
    maxWeight: 12,
    purpose: "Kommt Wachstum bei Aktionaeren an?",
    indicators: [
      {
        key: "share_count_dilution",
        label: "Share Count Growth / Dilution",
        guidance: "Bewerte Share Count Growth YoY, diluted shares CAGR und ob Buybacks echte Verwaesserung reduzieren.",
        aliases: ["share count", "dilution", "shares outstanding"],
      },
      {
        key: "sbc_burden",
        label: "SBC-Belastung",
        guidance: "Bewerte SBC/Revenue, SBC/Gross Profit und SBC/Operating Cashflow.",
        aliases: ["sbc", "stock based compensation"],
      },
      {
        key: "balance_sheet_runway",
        label: "Bilanz, Net Debt / EBITDA, Cash Runway",
        guidance: "Bewerte Verschuldung, Net Cash, Debt Maturity Wall und Runway.",
        aliases: ["net debt", "ebitda", "cash runway", "debt"],
      },
      {
        key: "fcf_after_sbc",
        label: "FCF after SBC / Kapitaldisziplin",
        guidance: "Bewerte, ob Wachstum nach SBC und Capex als echter Cashflow bei Aktionaeren ankommt.",
        aliases: ["fcf after sbc", "capital discipline"],
      },
    ],
    scoringGuide: [
      "Sehr positiv: sinkende Aktienanzahl plus positiver FCF.",
      "Positiv: stabile Aktienanzahl plus positiver FCF.",
      "Neutral bis leicht negativ: moderate Verwaesserung bei sehr starkem Wachstum.",
      "Negativ: hohe SBC ohne klare Effizienzsteigerung.",
      "Harter Blocker: steigende Aktienanzahl plus negativer FCF plus hohe Verschuldung.",
    ],
    redFlags: [
      "Share Count Growth >3% p.a.",
      "SBC / Revenue >10%.",
      "SBC / Operating Cash Flow >30%.",
      "Net Debt / EBITDA >3.",
      "Cash Runway <18 Monate.",
      "Buybacks kompensieren nur SBC ohne echten Rueckkaufnutzen.",
    ],
    hardBlockers: ["Steigende Aktienanzahl + negativer FCF + hohe Verschuldung."],
  },
  catalysts_revisions_sentiment: {
    id: "catalysts_revisions_sentiment",
    researchSection: "research.md Paragraph 15",
    title: "F - Catalysts, Revisions & Sentiment",
    maxWeight: 12,
    purpose: "Gibt es aktuelle Nachfrage nach der Aktie?",
    indicators: [
      {
        key: "fundamental_catalysts",
        label: "Fundamentale Katalysatoren",
        guidance: "Bewerte Earnings Beat, Guidance Raise, Produktlaunch, neue Grosskunden, Regulierungsfreigabe oder Makrotrend.",
        aliases: ["catalyst", "earnings beat", "guidance", "launch"],
      },
      {
        key: "estimate_revisions",
        label: "Analystenrevisionen",
        guidance: "Bewerte EPS/Revenue/EBITDA Revisionen, Upgrades vs Downgrades, Guidance-Historie und Schaetzungsdispersion.",
        aliases: ["revision", "upgrade", "downgrade", "analyst"],
      },
      {
        key: "news_sentiment_quality",
        label: "News- und Sentiment-Qualitaet",
        guidance: "Bewerte, ob News fundamental relevant sind; Social Media ist hoechstens Aufmerksamkeit, kein Alpha-Beweis.",
        aliases: ["news", "sentiment", "rss"],
      },
    ],
    scoringGuide: [
      "Hohe Scores brauchen belegte neue Informationen oder steigende Erwartungen.",
      "Sentiment darf fundamentale Daten, Liquiditaet oder Risikoregeln nicht ueberschreiben.",
      "Kurszielmeldungen ohne Revisions- oder Cashflow-Logik sind schwach.",
    ],
    redFlags: [
      "Nur Social-Media-Hype.",
      "Nachricht ist bereits voll eingepreist.",
      "Katalysator ist binaer und nicht modellierbar.",
      "Hoher News-Flow, aber keine Ergebnisrevisionen.",
      "Insider verkaufen aggressiv nach positiven Meldungen.",
    ],
  },
  ownership_smart_money: {
    id: "ownership_smart_money",
    researchSection: "research.md Paragraph 16",
    title: "G - Ownership & Smart Money",
    maxWeight: 8,
    purpose: "Unterstuetzen Kapitalstroeme und Insider-Signale die These?",
    indicators: [
      {
        key: "insider_cluster_buying",
        label: "Insider Cluster Buying / Nettoaktivitaet",
        guidance: "Bewerte Cluster-Kaeufe, Insider-Nettofluss und Management-Beteiligung.",
      },
      {
        key: "institutional_flow_trend",
        label: "Institutioneller Trend",
        guidance: "Bewerte, ob Institutionelle akkumulieren oder distribuieren.",
      },
      {
        key: "short_interest_context",
        label: "Short-Interest-Kontext",
        guidance: "Unterscheide fragiles Short-Risiko von konstruktivem Squeeze-Setup.",
      },
      {
        key: "buyback_vs_dilution",
        label: "Buyback vs. Verwässerung",
        guidance: "Bewerte, ob Rueckkaeufe echte Verwässerung neutralisieren oder nur SBC decken.",
      },
    ],
    scoringGuide: [
      "Hoher Score bei Cluster-Buying, positiver institutioneller Tendenz und kontrollierter Verwässerung.",
      "Niedriger Score bei aggressivem Insider-Verkauf, Distribution und steigendem Short-Risiko.",
    ],
    redFlags: [
      "Hoher Short-Float ohne positives Setup.",
      "Insider verkaufen in Serie waehrend positiver News-Lage.",
      "Anhaltende Verwässerung ohne glaubwuerdigen Buyback-Effekt.",
    ],
  },
  risk_fragility: {
    id: "risk_fragility",
    researchSection: "research.md Paragraph 16",
    title: "H - Risk & Fragility",
    maxWeight: 12,
    purpose: "Was kann die These zerstoeren?",
    indicators: [
      {
        key: "financial_fragility",
        label: "Bilanz-, FCF- und Liquiditaetsrisiko",
        guidance: "Bewerte Bilanzstress, negativen FCF, Liquiditaet, Spreads, Runway und Debt Maturity Wall.",
        aliases: ["balance sheet", "fcf", "liquidity", "runway"],
      },
      {
        key: "business_model_fragility",
        label: "Kunden-, Lieferketten-, Regulierungs- und Disruptionsrisiko",
        guidance: "Bewerte Konzentration, zyklisches Geschaeft, Regulierung, Management und KI-/Disruptionsrisiko.",
        aliases: ["customer concentration", "regulation", "disruption"],
      },
      {
        key: "market_fragility",
        label: "Bewertungs-, Zins-, Beta- und Gap-Risiko",
        guidance: "Bewerte Beta, Bewertungsniveau, Zinsabhaengigkeit, Volatilitaet und Gap-Risiko.",
        aliases: ["beta", "valuation risk", "interest rate", "gap risk"],
      },
    ],
    scoringGuide: [
      "Risk Score ist invers: niedrige Fragilitaet = hoher Score.",
      "Positiv: niedriges Beta, stabile Margen, breite Kundenbasis.",
      "Neutral bis leicht negativ: hohes Beta, aber hohe Qualitaet und liquide Aktie.",
      "Negativ: hohe Kundenkonzentration oder zyklisches Geschaeft.",
      "Stark negativ: regulatorisches binaeres Risiko.",
      "Harter Blocker: Bilanzstress plus negativer FCF.",
    ],
    redFlags: [
      "Bewertungsrisiko.",
      "Zinsrisiko.",
      "Beta-Risiko.",
      "Liquiditaets- oder Gap-Risiko.",
      "Kundenkonzentration.",
      "Regulierungs- oder binaeres Zulassungsrisiko.",
      "Bilanzstress, Verwaesserungsrisiko oder Betrugsverdacht.",
      "KI-Kommoditisierungsrisiko.",
    ],
    hardBlockers: ["Bilanzstress + negativer FCF."],
  },
};

export function formatBlockRubric(blockId: BlockKey): string {
  const rubric = RESEARCH_BLOCK_RUBRIC[blockId];
  const indicatorLines = rubric.indicators
    .map((i, idx) => `${idx + 1}. ${i.key}: ${i.label}. ${i.guidance}`)
    .join("\n");
  return [
    `RUBRIK: ${rubric.title} (${rubric.researchSection}, Gewicht ${rubric.maxWeight}/100)`,
    `Ziel: ${rubric.purpose}`,
    "Pflicht-Indikatoren: Nutze genau diese indicator.name Keys in genau dieser Reihenfolge. Wenn ein Indikator nicht belegbar ist, score=null.",
    indicatorLines,
    "Scoring aus research.md:",
    ...rubric.scoringGuide.map((s) => `- ${s}`),
    "Aktiv zu pruefende Red Flags:",
    ...rubric.redFlags.map((s) => `- ${s}`),
    ...(rubric.hardBlockers?.length
      ? ["Harte Blocker fuer diesen Block:", ...rubric.hardBlockers.map((s) => `- ${s}`)]
      : []),
    ...(rubric.specialInstructions?.length
      ? ["Spezialausgabe:", ...rubric.specialInstructions.map((s) => `- ${s}`)]
      : []),
  ].join("\n");
}

export function knownIndicatorKeys(blockId: BlockKey): string[] {
  return RESEARCH_BLOCK_RUBRIC[blockId].indicators.map((i) => i.key);
}
