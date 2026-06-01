const SENTINEL_PATTERNS = [
  /^no\s+(clear\s+)?hard\s+blockers?\s*(triggered|found|present)?\.?$/i,
  /^no\s+hard\s+blockers?\.?$/i,
  /^keine\s+(harten?\s+)?blocker\.?$/i,
  /^none\.?$/i,
  /^null\.?$/i,
  /^n\.?\s*\/?\s*a\.?$/i,
  /^unknown\.?$/i,
  /^-+$/,
];

const NON_EVENT_PATTERNS = [
  /not triggered/i,
  /not flagged/i,
  /nicht ausgel[oö]st/i,
  /nicht erfuellt/i,
  /nicht erfüllt/i,
  /no evidence of/i,
];

const QA_TELEMETRY_PATTERNS = [
  /unsichere quellenreferenz/i,
  /sourceidx.*does not support/i,
  /json repair/i,
  /schema repair/i,
  /validator/i,
];

export function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}]+/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeInvestmentStrings(raw: string[], mode: "hard_blocker" | "red_flag"): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of raw ?? []) {
    const s = String(value ?? "").trim();
    if (!s) continue;

    if (SENTINEL_PATTERNS.some((re) => re.test(s))) continue;
    if (NON_EVENT_PATTERNS.some((re) => re.test(s))) continue;
    if (QA_TELEMETRY_PATTERNS.some((re) => re.test(s))) continue;

    // Hard blocker list should remain stricter than red flags.
    if (mode === "hard_blocker" && /not\s+applicable|n\/?a/i.test(s)) continue;

    const key = normalizeForDedup(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  return out;
}
