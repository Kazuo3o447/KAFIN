import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dirPath: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("no seed in prod", () => {
  it("does not contain seed/demo/mock/fixture toggles in production paths", () => {
    const files = walk(path.join(process.cwd(), "src"));
    const deny = /\b(if\s*\(\s*mock\s*\)|seed data|demo data|fixture data)\b/i;

    const hits: string[] = [];
    for (const file of files) {
      const txt = fs.readFileSync(file, "utf8");
      if (deny.test(txt)) {
        hits.push(path.relative(process.cwd(), file));
      }
    }

    expect(hits).toEqual([]);
  });
});
