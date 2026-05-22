"use client";
/**
 * RedTeamPanel – zeigt die Red-Team-Analyse mit Bear-Argumenten,
 * Stress-Test und Gesamturteil.
 * Phase C / research.md §38.
 */
import type { Report } from "@/lib/schemas/report";

type RedTeam = NonNullable<Report["red_team"]>;

const SEVERITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#22c55e",
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
};

interface Props {
  redTeam: RedTeam;
}

export function RedTeamPanel({ redTeam }: Props) {
  return (
    <div className="space-y-4">
      {/* Bear Arguments */}
      {redTeam.bear_arguments.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
            Bear-Argumente
          </h3>
          <div className="space-y-2">
            {redTeam.bear_arguments.map((arg, i) => (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm"
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      background: `${SEVERITY_COLORS[arg.severity] ?? "#f59e0b"}20`,
                      color: SEVERITY_COLORS[arg.severity] ?? "#f59e0b",
                      border: `1px solid ${SEVERITY_COLORS[arg.severity] ?? "#f59e0b"}40`,
                    }}
                  >
                    {SEVERITY_LABELS[arg.severity] ?? arg.severity}
                  </span>
                  <span className="text-white/90">{arg.argument}</span>
                </div>
                {arg.rebuttal_of && (
                  <p className="mt-1 pl-10 text-white/40 text-xs">
                    Kontra: {arg.rebuttal_of}
                  </p>
                )}
                <div className="mt-1 pl-10 flex gap-3 text-white/40 text-xs">
                  <span>Eintrittswahrsch.: {(arg.probability * 100).toFixed(0)}%</span>
                  {arg.sourceIdx != null && (
                    <span>Quelle #{arg.sourceIdx}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overlooked Risks */}
      {redTeam.overlooked_risks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
            Übersehene Risiken
          </h3>
          <ul className="space-y-1">
            {redTeam.overlooked_risks.map((risk, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                <span className="mt-1.5 shrink-0 h-1.5 w-1.5 rounded-full bg-orange-400" />
                {risk}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stress Test */}
      {(redTeam.stress_test.revenue_growth_halved ||
        redTeam.stress_test.margin_compression_5ppt ||
        redTeam.stress_test.multiple_contraction_30pct) && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
            Stress-Test-Szenarien
          </h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { label: "Wachstum halbiert", value: redTeam.stress_test.revenue_growth_halved },
              { label: "Marge −5 Pp.", value: redTeam.stress_test.margin_compression_5ppt },
              { label: "Multiple −30%", value: redTeam.stress_test.multiple_contraction_30pct },
            ]
              .filter((s) => s.value)
              .map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm"
                >
                  <p className="text-xs text-white/50 mb-1">{s.label}</p>
                  <p className="text-white/90">{s.value}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Final Verdict */}
      {redTeam.final_verdict && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">
            Red-Team-Urteil
          </h3>
          <p className="text-sm text-white/90 leading-relaxed bg-white/5 rounded-lg border border-white/10 p-3">
            {redTeam.final_verdict}
          </p>
        </section>
      )}

      <p className="text-xs text-white/30 pt-1">
        Confidence: {redTeam.confidence} · Automatisch generierte Gegenanalyse
      </p>
    </div>
  );
}
