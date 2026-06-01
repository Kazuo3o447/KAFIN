import { describe, expect, it } from "vitest";
import { containsPotentialSecret, sanitizeUrlForAudit } from "@/lib/utils/secrets";

describe("secrets hygiene", () => {
  it("detects likely API key patterns", () => {
    expect(containsPotentialSecret("api_key=sk-1234567890abcdefghijklmnopqrst")).toBe(true);
  });

  it("redacts sensitive query params from URLs", () => {
    const url = sanitizeUrlForAudit("https://api.example.com/data?token=abc123&api_key=secret123");
    expect(url).toContain("token=REDACTED");
    expect(url).toContain("api_key=REDACTED");
  });
});
