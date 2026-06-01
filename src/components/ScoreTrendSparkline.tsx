import type { ScoreHistoryPoint } from "@/lib/research/score-history";

interface Props {
  history: ScoreHistoryPoint[];
}

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function ScoreTrendSparkline({ history }: Props) {
  const values = history.map((point) => point.scoreTotal);
  const last = history[history.length - 1];
  const first = history[0];
  const delta = first && last ? last.scoreTotal - first.scoreTotal : 0;
  const width = 260;
  const height = 88;
  const path = buildPath(values, width, height);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-secondary-500">Score Trend</div>
          <div className="text-sm text-secondary-300">Letzte {history.length} Runs</div>
        </div>
        <div className={`text-sm font-mono ${delta >= 0 ? "text-green-300" : "text-red-300"}`}>
          {delta >= 0 ? "+" : ""}{delta.toFixed(0)}
        </div>
      </div>
      {history.length > 0 ? (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
          <defs>
            <linearGradient id="scoreTrendFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(56, 189, 248, 0.28)" />
              <stop offset="100%" stopColor="rgba(56, 189, 248, 0.04)" />
            </linearGradient>
          </defs>
          <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill="url(#scoreTrendFill)" />
          <path d={path} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {values.map((value, index) => {
            const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
            const min = Math.min(...values);
            const max = Math.max(...values);
            const span = Math.max(1, max - min);
            const y = height - ((value - min) / span) * height;
            return <circle key={`${history[index]?.reportId ?? index}`} cx={x} cy={y} r="2.5" fill="#e2e8f0" />;
          })}
        </svg>
      ) : (
        <div className="text-sm text-secondary-500 border border-dashed border-secondary-700 rounded-lg p-4">
          Noch keine Score-Historie verfügbar.
        </div>
      )}
      {last && (
        <div className="mt-3 text-xs text-secondary-500 flex items-center justify-between gap-2">
          <span>Zuletzt: {last.researchDate}</span>
          <span>{last.trend === "up" ? "Trend steigend" : last.trend === "down" ? "Trend fallend" : "Trend stabil"}</span>
        </div>
      )}
    </div>
  );
}
