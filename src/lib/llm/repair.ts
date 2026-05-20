/**
 * Robust JSON Parser (portiert aus 1index.html).
 * Nimmt LLM-Output, entfernt Markdown-Fences, repariert offene Klammern/Strings.
 */
export function parseRobustJSON<T = unknown>(text: string): T {
  if (!text) throw new Error("Kein Text zur Verarbeitung");

  let clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = clean.indexOf("{");
  if (firstBrace === -1) throw new Error("Kein JSON-Objekt ({...}) gefunden.");
  clean = clean.substring(firstBrace);

  try {
    return JSON.parse(clean) as T;
  } catch (e) {
    try {
      // Track string + bracket state in one pass
      const stack: string[] = [];
      let inString = false;
      let escape = false;
      for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (escape) { escape = false; continue; }
        if (ch === "\\") { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === "{") stack.push("}");
        else if (ch === "[") stack.push("]");
        else if (ch === "}" || ch === "]") {
          const expected = stack[stack.length - 1];
          if (ch === expected) stack.pop();
        }
      }
      // Close unterminated string only if we ended inside one
      if (inString) clean += '"';
      // Strip trailing commas before close
      clean = clean.replace(/,\s*$/g, "");
      while (stack.length > 0) clean += stack.pop();
      return JSON.parse(clean) as T;
    } catch {
      try {
        const rigid = clean.replace(/[\n\r\t]/g, " ");
        return JSON.parse(rigid) as T;
      } catch (e3) {
        throw new Error(
          `JSON Reparatur gescheitert: ${(e as Error).message} → ${(e3 as Error).message}`,
        );
      }
    }
  }
}
