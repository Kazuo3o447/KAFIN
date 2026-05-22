/**
 * DecisionHero – Hero-Komponente: Verdict links, Fair-Value-Panel rechts.
 * Phase F.4
 */
import type { Gate, Category } from "@/lib/scoring/gate";
import type { Report } from "@/lib/schemas/report";
import { FairValuePanel } from "@/components/FairValuePanel";

type Confidence = "low" | "medium" | "high";
type Verdict = NonNullable<Report["verdict"]>;
type FairValue = NonNullable<Report["fair_value"]>;

const GATE_BADGE: Record<Gate, string> = {
  Green:  "bg-green-700/20 text-green-300 border-green-700/40",
  Yellow: "bg-amber-700/20 text-amber-300 border-amber-700/40",
  Red:    "bg-red-700/20 text-red-300 border-red-700/40",
};

const GATE_STRIP: Record<Gate, string> = {
  Green:  "score-strip-green",
  Yellow: "score-strip-yellow",
  Red:    "score-strip-red",
};

interface Props {
  ticker: string;
  companyName: string;
  exchange: string;
  researchDate: string;
  gate: Gate;
  category: Category;
  confidence: Confidence;
  verdict: Verdict | null;
  fairValue: FairValue | null;
  handoff?: boolean;
  isPrint?: boolean;
  children?: React.ReactNode; // export buttons slot
}

export function DecisionHero({
  ticker,
  companyName,
  exchange,
  researchDate,
  gate,
  category,
  confidence,
  verdict,
  fairValue,
  handoff,
  isPrint,
  children,
}: Props) {
  return (
    <div className={`glass-card ${GATE_STRIP[gate]} p-4 sm:p-5`}>
      <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-5 items-start">

        {/* Left: Verdict + identity */}
        <div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight font-mono text-accent-400">
              {ticker}
            </h1>
            <span className="text-lg text-secondary-300">{companyName}</span>
            {exchange && (
              <span className="text-xs text-secondary-500">{exchange}</span>
            )}
          </div>
          <div className="text-xs text-secondary-500 mt-0.5">Stand {researchDate}</div>

          {/* Badge row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`text-xs uppercase tracking-wide px-2 py-1 rounded border ${GATE_BADGE[gate]}`}>
              Gate · {gate}
            </span>
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-secondary-700 text-secondary-300">
              {category}
            </span>
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-secondary-700 text-secondary-400">
              Confidence · {confidence}
            </span>
            {handoff && (
              <span className="text-xs uppercase tracking-wide px-2 py-1 rounded border border-green-700/40 text-green-400">
                Handoff → Trade Engine
              </span>
            )}
          </div>

          {/* Verdict label */}
          {verdict ? (
            <div className="mt-4 space-y-1">
              <div className="text-[18px] font-medium text-secondary-100 leading-snug">
                {verdict.label}
              </div>
              {verdict.detail && (
                <div className="text-[13px] text-secondary-400 leading-relaxed">
                  {verdict.detail}
                </div>
              )}
            </div>
          ) : (
            // Fallback for older reports without verdict
            <div className="mt-4 text-sm text-secondary-400 italic">
              Verdict nicht verfügbar (älterer Report)
            </div>
          )}

          {/* Action slot (export buttons, pin) */}
          {!isPrint && children && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {children}
            </div>
          )}
        </div>

        {/* Right: FairValuePanel */}
        <div>
          <FairValuePanel fairValue={fairValue} isPrint={isPrint} />
        </div>
      </div>
    </div>
  );
}
