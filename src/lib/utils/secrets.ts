const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /gsk_[A-Za-z0-9_\-]{20,}/,
  /Bearer\s+[A-Za-z0-9._\-]{20,}/i,
  /api[_-]?key\s*[:=]\s*[A-Za-z0-9_\-]{12,}/i,
  /token\s*[:=]\s*[A-Za-z0-9_\-]{12,}/i,
];

const SECRET_QUERY_KEYS = new Set([
  "token",
  "api_key",
  "apikey",
  "key",
  "access_token",
  "auth",
  "authorization",
  "signature",
]);

export function containsPotentialSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeUrlForAudit(input: string): string {
  try {
    const url = new URL(input);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SECRET_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, "REDACTED");
      }
    }
    return url.toString();
  } catch {
    return input.replace(/(token|api[_-]?key|apikey|access_token)=([^&\s]+)/gi, "$1=REDACTED");
  }
}
