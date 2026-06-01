import { describe, expect, it } from "vitest";
import { TrackedNumberSchema, TrackedStringSchema } from "@/lib/schemas/dataset";

describe("provenance required", () => {
  it("rejects non-null tracked number without asOf", () => {
    expect(() =>
      TrackedNumberSchema.parse({
        value: 42,
        kind: "actual",
        provenance: {
          source: "test",
          url: "https://example.com",
          klass: "B",
          asOf: null,
          stale: false,
        },
      }),
    ).toThrow(/asOf/i);
  });

  it("accepts null tracked value without asOf", () => {
    const parsed = TrackedStringSchema.parse({
      value: null,
      kind: "actual",
      provenance: {
        source: "test",
        url: "https://example.com",
        klass: "B",
        asOf: null,
        stale: false,
      },
    });

    expect(parsed.value).toBeNull();
  });
});
