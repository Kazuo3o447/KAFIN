/**
 * SourceList – nummerierte Quellenliste mit Klassen-Badge (A..E).
 */
import type { z } from "zod";
import type { SourceSchema } from "@/lib/schemas/report";

type Source = z.infer<typeof SourceSchema>;

const KLASS_COLOR: Record<Source["class"], string> = {
  A: "bg-green-600/20 text-green-400 border-green-700/40",
  "A-": "bg-green-700/15 text-green-300 border-green-800/40",
  B: "bg-sky-600/20 text-sky-300 border-sky-700/40",
  "B-": "bg-sky-700/15 text-sky-400 border-sky-800/40",
  C: "bg-amber-600/15 text-amber-300 border-amber-700/40",
  D: "bg-orange-700/15 text-orange-300 border-orange-800/40",
  E: "bg-red-700/15 text-red-300 border-red-800/40",
};

interface Props {
  sources: Source[];
}

export function SourceList({ sources }: Props) {
  if (sources.length === 0) {
    return <div className="text-sm text-secondary-500">— keine Quellen erfasst —</div>;
  }
  return (
    <ol className="space-y-2 text-sm">
      {sources.map((s) => (
        <li key={s.idx} className="flex items-start gap-3">
          <span className="font-mono text-xs text-secondary-500 mt-0.5 w-8 shrink-0">
            [{s.idx}]
          </span>
          <span
            className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${KLASS_COLOR[s.class]}`}
            title={`Klasse ${s.class}`}
          >
            {s.class}
          </span>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-400 hover:underline break-all"
          >
            {s.title || s.url}
          </a>
        </li>
      ))}
    </ol>
  );
}
