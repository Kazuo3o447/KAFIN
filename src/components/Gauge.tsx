/**
 * Gauge – Semicircle SVG für Growth-Research-Score 0-100.
 * Farbe an Gate gekoppelt (Green/Yellow/Red).
 */
import type { Gate } from "@/lib/scoring/gate";

const GATE_COLOR: Record<Gate, string> = {
  Green: "#22c55e",
  Yellow: "#f59e0b",
  Red: "#ef4444",
};

interface Props {
  score: number; // 0..100
  gate: Gate;
  size?: number;
}

export function Gauge({ score, gate, size = 220 }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 90;
  const cx = 110;
  const cy = 110;
  const circumference = Math.PI * r; // halber Kreis
  const offset = circumference - (clamped / 100) * circumference;
  const color = GATE_COLOR[gate];

  return (
    <div className="gauge-container" style={{ maxWidth: size }}>
      <svg viewBox="0 0 220 130" width={size} height={(size * 130) / 220}>
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize="34"
          fontWeight="600"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {Math.round(clamped)}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
          fontFamily="Inter, system-ui, sans-serif"
        >
          GROWTH-RESEARCH-SCORE
        </text>
      </svg>
    </div>
  );
}
