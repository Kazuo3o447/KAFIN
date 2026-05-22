/**
 * Peer Universe – statische Bucket-Tabelle für sektorrelative Normalisierung.
 * Bucket = Peer-Gruppe, die ein Unternehmen bekommt, basierend auf
 * BusinessModelType + Umsatzgröße (scale).
 *
 * Jeder Bucket enthält:
 *   - Median-Kennzahlen (aus öffentlich verfügbaren Research-Benchmarks)
 *   - Gewichtungsanpassungen (z.B. SaaS darf höheres SBC_to_revenue)
 *
 * Quellen / Basis: Bessemer Venture Partners State of the Cloud, ICONIQ SaaS Benchmarks,
 * McKinsey Fintech benchmarks, FactSet/Bloomberg consensus medians (Q4 2024).
 * Werte werden jährlich in research.md §38 dokumentiert und bei Bedarf aktualisiert.
 */

import type { BusinessModelType } from "./business-model";

export type PeerScale = "micro" | "small" | "mid" | "large";   // <100M, 100M–1B, 1B–10B, >10B revenue

export interface PeerBenchmark {
  bucketId: string;
  label: string;
  businessModel: BusinessModelType;
  scale: PeerScale | "all";
  /**
   * Median-Werte für die zentralen KeyMetrics (als Dezimalbrüche wo zutreffend).
   * null = keine verlässliche Referenz vorhanden.
   */
  medians: {
    revenue_growth_yoy: number | null;
    gross_margin: number | null;
    operating_margin: number | null;
    fcf_margin: number | null;
    net_debt_to_ebitda: number | null;
    roic: number | null;
    ev_sales: number | null;
    rule_of_40: number | null;
    sbc_to_revenue: number | null;
    piotroski_f: number | null;
  };
}

export const PEER_BUCKETS: PeerBenchmark[] = [
  // ── SaaS ────────────────────────────────────────────────────────────────────
  {
    bucketId: "saas_small",
    label: "SaaS – Small Cap (<$1B Revenue)",
    businessModel: "SaaS",
    scale: "small",
    medians: {
      revenue_growth_yoy: 0.22,
      gross_margin: 0.72,
      operating_margin: -0.08,
      fcf_margin: 0.05,
      net_debt_to_ebitda: null,
      roic: null,
      ev_sales: 8.0,
      rule_of_40: 27,
      sbc_to_revenue: 0.14,
      piotroski_f: 4,
    },
  },
  {
    bucketId: "saas_large",
    label: "SaaS – Large Cap (>$1B Revenue)",
    businessModel: "SaaS",
    scale: "large",
    medians: {
      revenue_growth_yoy: 0.14,
      gross_margin: 0.75,
      operating_margin: 0.08,
      fcf_margin: 0.18,
      net_debt_to_ebitda: 0.5,
      roic: 0.15,
      ev_sales: 7.5,
      rule_of_40: 32,
      sbc_to_revenue: 0.08,
      piotroski_f: 5,
    },
  },
  // ── Semiconductor ───────────────────────────────────────────────────────────
  {
    bucketId: "semiconductor",
    label: "Semiconductor",
    businessModel: "Semiconductor",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.10,
      gross_margin: 0.55,
      operating_margin: 0.20,
      fcf_margin: 0.18,
      net_debt_to_ebitda: 1.0,
      roic: 0.18,
      ev_sales: 5.0,
      rule_of_40: 28,
      sbc_to_revenue: 0.04,
      piotroski_f: 5,
    },
  },
  // ── FinTech ─────────────────────────────────────────────────────────────────
  {
    bucketId: "fintech",
    label: "FinTech / Payments",
    businessModel: "FinTech",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.18,
      gross_margin: 0.60,
      operating_margin: 0.10,
      fcf_margin: 0.12,
      net_debt_to_ebitda: 1.5,
      roic: 0.12,
      ev_sales: 6.0,
      rule_of_40: 28,
      sbc_to_revenue: 0.06,
      piotroski_f: 5,
    },
  },
  // ── E-Commerce ──────────────────────────────────────────────────────────────
  {
    bucketId: "ecommerce",
    label: "E-Commerce / Digital Retail",
    businessModel: "E-Commerce",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.14,
      gross_margin: 0.38,
      operating_margin: 0.04,
      fcf_margin: 0.04,
      net_debt_to_ebitda: 1.0,
      roic: 0.10,
      ev_sales: 1.8,
      rule_of_40: 18,
      sbc_to_revenue: 0.03,
      piotroski_f: 5,
    },
  },
  // ── Marketplace ─────────────────────────────────────────────────────────────
  {
    bucketId: "marketplace",
    label: "Marketplace / Platform",
    businessModel: "Marketplace",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.20,
      gross_margin: 0.65,
      operating_margin: 0.05,
      fcf_margin: 0.10,
      net_debt_to_ebitda: 0.5,
      roic: 0.12,
      ev_sales: 5.5,
      rule_of_40: 25,
      sbc_to_revenue: 0.08,
      piotroski_f: 4,
    },
  },
  // ── Infrastructure ──────────────────────────────────────────────────────────
  {
    bucketId: "infrastructure",
    label: "Cloud Infrastructure / Data Centers",
    businessModel: "Infrastructure",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.15,
      gross_margin: 0.62,
      operating_margin: 0.15,
      fcf_margin: 0.16,
      net_debt_to_ebitda: 1.5,
      roic: 0.13,
      ev_sales: 6.0,
      rule_of_40: 31,
      sbc_to_revenue: 0.05,
      piotroski_f: 5,
    },
  },
  // ── BioTech ─────────────────────────────────────────────────────────────────
  {
    bucketId: "biotech",
    label: "BioTech / Biopharma",
    businessModel: "BioTech",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.15,
      gross_margin: 0.70,
      operating_margin: -0.10,
      fcf_margin: -0.08,
      net_debt_to_ebitda: null,
      roic: null,
      ev_sales: 4.5,
      rule_of_40: null,
      sbc_to_revenue: 0.10,
      piotroski_f: 3,
    },
  },
  // ── MedDevice ───────────────────────────────────────────────────────────────
  {
    bucketId: "meddevice",
    label: "Medical Devices",
    businessModel: "MedDevice",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.08,
      gross_margin: 0.62,
      operating_margin: 0.15,
      fcf_margin: 0.12,
      net_debt_to_ebitda: 1.5,
      roic: 0.12,
      ev_sales: 4.5,
      rule_of_40: null,
      sbc_to_revenue: 0.04,
      piotroski_f: 5,
    },
  },
  // ── EnterpriseHW ────────────────────────────────────────────────────────────
  {
    bucketId: "enterprise_hw",
    label: "Enterprise Hardware",
    businessModel: "EnterpriseHW",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.06,
      gross_margin: 0.45,
      operating_margin: 0.12,
      fcf_margin: 0.10,
      net_debt_to_ebitda: 1.5,
      roic: 0.12,
      ev_sales: 2.5,
      rule_of_40: null,
      sbc_to_revenue: 0.03,
      piotroski_f: 5,
    },
  },
  // ── Industrial / Energy / Financial / Healthcare / Consumer / Media / Telecom ─
  {
    bucketId: "industrial",
    label: "Industrial / Manufacturing",
    businessModel: "Industrial",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.05,
      gross_margin: 0.30,
      operating_margin: 0.08,
      fcf_margin: 0.06,
      net_debt_to_ebitda: 2.0,
      roic: 0.09,
      ev_sales: 1.2,
      rule_of_40: null,
      sbc_to_revenue: 0.01,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "energy",
    label: "Energy",
    businessModel: "Energy",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.04,
      gross_margin: 0.35,
      operating_margin: 0.12,
      fcf_margin: 0.08,
      net_debt_to_ebitda: 2.5,
      roic: 0.08,
      ev_sales: 1.5,
      rule_of_40: null,
      sbc_to_revenue: 0.01,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "financial",
    label: "Financial Services / Banks",
    businessModel: "Financial",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.07,
      gross_margin: null,
      operating_margin: 0.25,
      fcf_margin: null,
      net_debt_to_ebitda: null,
      roic: 0.10,
      ev_sales: 3.0,
      rule_of_40: null,
      sbc_to_revenue: 0.04,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "healthcare",
    label: "Healthcare Services",
    businessModel: "Healthcare",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.07,
      gross_margin: 0.40,
      operating_margin: 0.08,
      fcf_margin: 0.07,
      net_debt_to_ebitda: 2.0,
      roic: 0.09,
      ev_sales: 1.8,
      rule_of_40: null,
      sbc_to_revenue: 0.02,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "consumer",
    label: "Consumer / Retail",
    businessModel: "Consumer",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.05,
      gross_margin: 0.35,
      operating_margin: 0.07,
      fcf_margin: 0.05,
      net_debt_to_ebitda: 2.0,
      roic: 0.08,
      ev_sales: 1.5,
      rule_of_40: null,
      sbc_to_revenue: 0.02,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "media",
    label: "Media / Entertainment",
    businessModel: "Media",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.06,
      gross_margin: 0.55,
      operating_margin: 0.10,
      fcf_margin: 0.08,
      net_debt_to_ebitda: 2.5,
      roic: 0.09,
      ev_sales: 2.5,
      rule_of_40: null,
      sbc_to_revenue: 0.04,
      piotroski_f: 5,
    },
  },
  {
    bucketId: "telecom",
    label: "Telecom",
    businessModel: "Telecom",
    scale: "all",
    medians: {
      revenue_growth_yoy: 0.03,
      gross_margin: 0.50,
      operating_margin: 0.12,
      fcf_margin: 0.10,
      net_debt_to_ebitda: 3.0,
      roic: 0.08,
      ev_sales: 2.0,
      rule_of_40: null,
      sbc_to_revenue: 0.02,
      piotroski_f: 5,
    },
  },
];

/**
 * Findet den besten Bucket für ein Unternehmen basierend auf
 * BusinessModelType und optionaler Umsatzgröße.
 */
export function findPeerBucket(
  businessModelType: string,
  revenueUsd?: number | null,
): PeerBenchmark | null {
  const scale = resolveScale(revenueUsd);

  // Look for a scale-specific match first
  if (scale !== null) {
    const scaled = PEER_BUCKETS.find(
      (b) => b.businessModel === businessModelType && b.scale === scale,
    );
    if (scaled) return scaled;
  }

  // Fall back to "all" scale
  const generic = PEER_BUCKETS.find(
    (b) => b.businessModel === businessModelType && b.scale === "all",
  );
  if (generic) return generic;

  // Last resort: Other → null
  return null;
}

function resolveScale(revenueUsd: number | null | undefined): PeerScale | null {
  if (!revenueUsd || revenueUsd <= 0) return null;
  if (revenueUsd < 100_000_000) return "micro";
  if (revenueUsd < 1_000_000_000) return "small";
  if (revenueUsd < 10_000_000_000) return "mid";
  return "large";
}
