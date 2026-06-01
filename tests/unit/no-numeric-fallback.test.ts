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

describe("no numeric fallback", () => {
  it("forbids metric coercion like km.x ?? 0 or keyMetrics.x || 0", () => {
    const roots = [
      path.join(process.cwd(), "src", "lib", "research"),
      path.join(process.cwd(), "src", "lib", "scoring"),
      path.join(process.cwd(), "src", "lib", "orchestrator"),
    ];
    const files = roots.flatMap((root) => walk(root));

    const patterns = [
      /\bkm\.[a-zA-Z0-9_]+\s*\?\?\s*-?\d+(?:\.\d+)?/g,
      /\bkm\.[a-zA-Z0-9_]+\s*\|\|\s*-?\d+(?:\.\d+)?/g,
      /\bkeyMetrics\.[a-zA-Z0-9_]+\s*\?\?\s*-?\d+(?:\.\d+)?/g,
      /\bkeyMetrics\.[a-zA-Z0-9_]+\s*\|\|\s*-?\d+(?:\.\d+)?/g,
    ];

    const hits: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        if (patterns.some((rx) => rx.test(line))) {
          hits.push(`${path.relative(process.cwd(), file)}:${i + 1}:${line.trim()}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
