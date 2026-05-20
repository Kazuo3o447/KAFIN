import { describe, it, expect } from "vitest";
import { parseRobustJSON } from "@/lib/llm/repair";

describe("parseRobustJSON", () => {
  it("parst clean JSON", () => {
    expect(parseRobustJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("entfernt Markdown-Fences", () => {
    expect(parseRobustJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("repariert abgeschnittene Klammern", () => {
    const r = parseRobustJSON<{ a: number; b: { c: number } }>('{"a":1,"b":{"c":2');
    expect(r.a).toBe(1);
    expect(r.b.c).toBe(2);
  });

  it("ignoriert Prefix-Geschwätz", () => {
    expect(parseRobustJSON('Hier ist dein JSON: {"x":42}')).toEqual({ x: 42 });
  });

  it("wirft bei fehlendem Objekt", () => {
    expect(() => parseRobustJSON("kein json hier")).toThrow();
  });
});
