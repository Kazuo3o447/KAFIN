import type { ProviderFact } from "@/lib/providers/types";
import type { BusinessModelProfile } from "@/lib/research/business-model-classifier";
import type { KeyMetrics } from "@/lib/schemas/report";
import { THRESHOLDS } from "@/lib/research/thresholds";

export type AnalysisDomain = "fundamental" | "qualitative" | "data_incomplete";

export interface QualitativeEvidence {
  claim: string;
  sourceUrl: string;
  sourceDate: string | null;
  claimType: "backlog" | "capacity" | "financing" | "partner" | "bull" | "bear" | "catalyst";
}

export interface QualitativeThesis {
  verdict: "spekulativ_chance" | "spekulativ_risiko" | "beobachten";
  conviction: "low" | "medium" | "high";
  backlog: QualitativeEvidence[];
  capacity: QualitativeEvidence[];
  financing: QualitativeEvidence[];
  keyPartners: QualitativeEvidence[];
  executionRisks: string[];
  dilutionRisk: string | null;
  bull: QualitativeEvidence[];
  bear: QualitativeEvidence[];
  catalysts: QualitativeEvidence[];
  falsification: string[];
}

export interface PlausibilityFlag {
  code: "revenue_growth_implausible" | "net_debt_to_ebitda_implausible";
  metric: keyof KeyMetrics;
  severity: "warn" | "suppress";
  message: string;
}

export interface AnalysisDomainDecision {
  domain: AnalysisDomain;
  reasons: string[];
}

function sourceRank(url: string): number {
  if (/sec\.gov|investor|earnings|8-k|10-k|10-q/i.test(url)) return 0;
  if (/reuters|bloomberg|businesswire|globenewswire/i.test(url)) return 1;
  return 2;
}

function compactClaim(fact: ProviderFact): string {
  const title = (fact.title ?? "").trim();
  if (title.length >= 12) return title;
  const raw = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value ?? "");
  const text = raw.replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 177)}...`;
}

function collectEvidence(facts: ProviderFact[], kind: QualitativeEvidence["claimType"], matcher: RegExp, limit = 4): QualitativeEvidence[] {
  const seen = new Set<string>();
  return facts
    .filter((fact) => matcher.test(`${fact.field} ${fact.title ?? ""} ${typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value ?? "")}`))
    .sort((a, b) => {
      const rank = sourceRank(a.url) - sourceRank(b.url);
      if (rank !== 0) return rank;
      return (b.asOf ?? "").localeCompare(a.asOf ?? "");
    })
    .map((fact) => ({
      claim: compactClaim(fact),
      sourceUrl: fact.url,
      sourceDate: fact.asOf ?? null,
      claimType: kind,
    }))
    .filter((item) => {
      const key = `${item.sourceUrl}::${item.claim}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildQualitativeThesis(input: {
  facts: ProviderFact[];
  keyMetrics: KeyMetrics;
  profile: BusinessModelProfile | null | undefined;
  plausibilityFlags: PlausibilityFlag[];
}): QualitativeThesis {
  const backlog = collectEvidence(input.facts, "backlog", /(deal|agreement|contract|backlog|purchase|offtake|commitment|reserved capacity|order)/i);
  const capacity = collectEvidence(input.facts, "capacity", /(mw|gw|capacity|gpu|cluster|rack|h100|blackwell|datacenter|data center|buildout|build-out)/i);
  const financing = collectEvidence(input.facts, "financing", /(financing|credit facility|term loan|convertible|raise|funding|debt|liquidity|runway|cash)/i);
  const keyPartners = collectEvidence(input.facts, "partner", /(nvidia|microsoft|dell|amazon|google|meta|oracle|openai|coreweave|partner)/i);

  const bull = [...backlog.slice(0, 2), ...capacity.slice(0, 1), ...keyPartners.slice(0, 1)].slice(0, 3).map((item) => ({
    ...item,
    claimType: "bull" as const,
  }));
  const bear = [...financing.slice(0, 2)].map((item) => ({
    ...item,
    claimType: "bear" as const,
  }));
  const catalysts = [...backlog.slice(0, 1), ...capacity.slice(0, 1), ...financing.slice(0, 1)].map((item) => ({
    ...item,
    claimType: "catalyst" as const,
  }));

  const executionRisks = [
    "Kapazitätsausbau muss fristgerecht geliefert und monetarisiert werden.",
    "Kunden- und Partnerzusagen müssen in belastbare Auslastung übergehen.",
    ...(input.profile?.primaryFramework === "ai_infrastructure_neocloud"
      ? ["Strom-, Rechenzentrums- und GPU-Lieferkette bleiben kritische Engpässe."]
      : []),
  ];

  const shareCountGrowth = input.keyMetrics.share_count_growth_yoy;
  const dilutionRisk =
    shareCountGrowth !== null && shareCountGrowth >= THRESHOLDS.share_count_growth_red_flag
      ? `Verwässerung erhöht (${(shareCountGrowth * 100).toFixed(1)}% YoY).`
      : financing.length > 0
        ? "Finanzierungsbedarf beobachten; Kapitalstruktur kann sich weiter ausdehnen."
        : null;

  const positiveSignals = backlog.length + capacity.length + keyPartners.length;
  const negativeSignals = financing.length + input.plausibilityFlags.length + (dilutionRisk ? 1 : 0);
  const verdict =
    positiveSignals >= 3 && positiveSignals >= negativeSignals
      ? "spekulativ_chance"
      : negativeSignals > positiveSignals
        ? "spekulativ_risiko"
        : "beobachten";
  const evidenceCount = backlog.length + capacity.length + financing.length + keyPartners.length;
  const conviction = evidenceCount >= 6 ? "high" : evidenceCount >= 3 ? "medium" : "low";

  return {
    verdict,
    conviction,
    backlog,
    capacity,
    financing,
    keyPartners,
    executionRisks,
    dilutionRisk,
    bull,
    bear,
    catalysts,
    falsification: [
      "Kontrahierte Deals materialisieren sich nicht in Auslastung oder Umsatz.",
      "Der Finanzierungspfad verschlechtert sich deutlich oder erzwingt starke Verwässerung.",
      "Kapazitäts- oder Partnermeilensteine verzögern sich substanziell.",
    ],
  };
}

function factText(facts: ProviderFact[]): string {
  return facts
    .map((fact) => {
      const value = typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value ?? "");
      return `${fact.field} ${fact.title ?? ""} ${value}`;
    })
    .join(" ")
    .toLowerCase();
}

function hasTransformativeFinancing(facts: ProviderFact[]): boolean {
  const text = factText(facts);
  return /(credit facility|financing|term loan|convertible|equity raise|private placement|raised|funding)/.test(text)
    && /(billion|bn|gw|gpu|hyperscale|datacenter|data center)/.test(text);
}

export function determineAnalysisDomain(input: {
  profile: BusinessModelProfile | null | undefined;
  keyMetrics: KeyMetrics | null | undefined;
  facts: ProviderFact[];
  criticalCoverage: number;
  runIncompleteDueToTechnicalFailure: boolean;
}): AnalysisDomainDecision {
  const profile = input.profile;
  const km = input.keyMetrics;
  const reasons: string[] = [];

  if (!km) {
    return { domain: "data_incomplete", reasons: ["Key metrics missing."] };
  }

  if (input.runIncompleteDueToTechnicalFailure) {
    return { domain: "data_incomplete", reasons: ["Technical fetch failure marked run incomplete."] };
  }

  const structuralFramework = new Set([
    "ai_infrastructure_neocloud",
    "crypto_miner",
    "pre_revenue_buildout",
    "clinical_biotech",
    "spac",
  ]);

  const negativeOrMissingFcf = km.fcf_margin == null || km.fcf_margin < 0;
  const negativeOrMissingRoic = km.roic == null || km.roic <= 0;
  const capexHeavy = km.capex_ocf_ratio !== null && km.capex_ocf_ratio >= THRESHOLDS.domain_qualitative_capex_ocf_min;
  const preRevenueLike = (km.revenue_growth_yoy == null && km.revenue_cagr_3y == null)
    || ((km.gross_margin ?? null) === null && (km.operating_margin ?? null) === null && (km.fcf_margin ?? null) === null);
  const structuralReason = profile ? structuralFramework.has(profile.primaryFramework) : false;
  const transformativeFinancing = hasTransformativeFinancing(input.facts);

  if (structuralReason) reasons.push(`Framework ${profile?.primaryFramework} is structurally pre-fundamental.`);
  if (negativeOrMissingFcf && negativeOrMissingRoic) reasons.push("FCF and ROIC are negative or unavailable.");
  if (capexHeavy) reasons.push("Capex build-out dominates current cash profile.");
  if (preRevenueLike) reasons.push("Core fundamental ratio coverage is structurally thin.");
  if (transformativeFinancing) reasons.push("Recent financing/news flow indicates a transformative build-out.");

  const qualitativeSignals = [
    structuralReason,
    negativeOrMissingFcf && negativeOrMissingRoic,
    capexHeavy,
    preRevenueLike,
    transformativeFinancing,
  ].filter(Boolean).length;

  if (qualitativeSignals >= THRESHOLDS.domain_qualitative_signal_count_min) {
    return { domain: "qualitative", reasons };
  }

  if (input.criticalCoverage < THRESHOLDS.domain_data_incomplete_critical_coverage_min) {
    if (input.criticalCoverage < THRESHOLDS.domain_data_incomplete_critical_coverage_min) {
      reasons.push(`Critical metric coverage ${input.criticalCoverage.toFixed(2)} below threshold.`);
    }
    return { domain: "data_incomplete", reasons };
  }

  return { domain: "fundamental", reasons: reasons.length > 0 ? reasons : ["Fundamentals are applicable and sufficiently covered."] };
}

export function buildPlausibilityFlags(km: KeyMetrics, facts: ProviderFact[]): PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = [];
  const text = factText(facts);
  const hasLargeFinancingSignal = /(billion|bn|credit facility|private placement|financing)/.test(text);

  if (
    km.revenue_growth_yoy !== null
    && Math.abs(km.revenue_growth_yoy) <= THRESHOLDS.domain_implausible_growth_abs_max
    && ((km.fcf_margin !== null && km.fcf_margin <= THRESHOLDS.domain_implausible_fcf_margin_min) || hasLargeFinancingSignal)
  ) {
    flags.push({
      code: "revenue_growth_implausible",
      metric: "revenue_growth_yoy",
      severity: "suppress",
      message: "Revenue growth is implausibly flat relative to the cash burn / financing profile and should not drive the verdict.",
    });
  }

  const debtText = text.includes("lease") || text.includes("operating lease");
  if (
    km.net_debt_to_ebitda !== null
    && (km.net_debt_to_ebitda < 0 || debtText)
  ) {
    flags.push({
      code: "net_debt_to_ebitda_implausible",
      metric: "net_debt_to_ebitda",
      severity: "suppress",
      message: "Net debt / EBITDA is likely distorted by lease reconciliation or non-positive EBITDA and should be caveated.",
    });
  }

  return flags;
}