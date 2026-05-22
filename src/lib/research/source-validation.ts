interface CitationIndicator {
  name: string;
  score: number | null;
  rationale: string;
  sourceIdx: number | null;
}

interface CitationBlock {
  indicators: CitationIndicator[];
  red_flags?: string[];
}

const STOP_WORDS = new Set([
  "aber",
  "also",
  "and",
  "auf",
  "aus",
  "bei",
  "das",
  "den",
  "der",
  "die",
  "ein",
  "eine",
  "for",
  "from",
  "ist",
  "mit",
  "nicht",
  "oder",
  "ohne",
  "sich",
  "the",
  "und",
  "von",
  "with",
  "wird",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/[_/.-]+/g, " ");
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function numbers(text: string): string[] {
  return Array.from(text.matchAll(/[-+]?\d+(?:[.,]\d+)?%?/g)).map((m) => m[0]!.replace(",", "."));
}

export function sourceSupportsClaim(sourceIdx: number, claim: string, sourceEvidence: Map<number, string>): boolean {
  const evidence = sourceEvidence.get(sourceIdx);
  if (!evidence) return false;

  const evidenceText = normalize(evidence);
  const claimTokens = tokens(claim);
  if (claimTokens.length === 0) return true;

  const overlap = claimTokens.filter((token) => evidenceText.includes(token));
  if (overlap.length >= 1) return true;

  const claimNumbers = numbers(claim);
  if (claimNumbers.length === 0) return false;
  const evidenceNumbers = new Set(numbers(evidence));
  return claimNumbers.some((n) => evidenceNumbers.has(n));
}

export function validateBlockSources<T extends CitationBlock>(
  block: T,
  sourceEvidence: Map<number, string>,
): T & { invalid_source_refs: string[] } {
  const invalid: string[] = [];
  const indicators = block.indicators.map((indicator) => {
    const idx = indicator.sourceIdx;
    if (idx == null) return indicator;
    const claim = `${indicator.name} ${indicator.rationale}`;
    if (sourceSupportsClaim(idx, claim, sourceEvidence)) return indicator;
    invalid.push(`${indicator.name}: sourceIdx ${idx} does not support rationale`);
    return { ...indicator, sourceIdx: null };
  });

  return {
    ...block,
    indicators,
    invalid_source_refs: invalid,
    red_flags:
      invalid.length > 0
        ? [...(block.red_flags ?? []), ...invalid.map((msg) => `Unsichere Quellenreferenz entfernt (${msg})`)]
        : block.red_flags,
  };
}
