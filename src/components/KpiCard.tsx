/**
 * KpiCard – kleine Metrik-Kachel.
 */
interface Props {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
}

function format(v: Props["value"]) {
  if (v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))) return "—";
  if (typeof v === "number") return v.toFixed(Math.abs(v) >= 100 ? 0 : 2);
  return String(v);
}

export function KpiCard({ label, value, unit, hint }: Props) {
  return (
    <div className="glass-card p-4">
      <div className="text-xs uppercase tracking-wide text-secondary-500">{label}</div>
      <div className="text-xl font-semibold mt-1 text-secondary-100">
        {format(value)}
        {value !== null && value !== undefined && unit ? (
          <span className="text-sm font-normal text-secondary-400 ml-1">{unit}</span>
        ) : null}
      </div>
      {hint ? <div className="text-xs text-secondary-500 mt-1">{hint}</div> : null}
    </div>
  );
}
