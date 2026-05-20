"use client";
/**
 * RadarChart – Chart.js Radar für die 7 Score-Blöcke.
 * Werte sind die *erreichten* Block-Punkte (z.B. growth_market 0..18).
 */
import { useEffect, useRef } from "react";
import {
  Chart,
  RadarController,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { BLOCK_LABELS, BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface Props {
  /** Erreichte Punkte je Block (gewichtet, gleicher Maßstab wie BLOCK_WEIGHTS). */
  values: Record<BlockKey, number>;
}

const ORDER: BlockKey[] = [
  "growth_market",
  "unit_economics_margins",
  "quality_moat",
  "valuation",
  "capital_discipline_dilution",
  "catalysts_revisions_sentiment",
  "risk_fragility",
];

export function RadarChart({ values }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext("2d");
    if (!ctx) return;

    // Werte auf 0..1 normalisieren je Block-Maximum.
    const dataNormalized = ORDER.map((k) => {
      const max = BLOCK_WEIGHTS[k];
      const v = values[k] ?? 0;
      return max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    });

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: "radar",
      data: {
        labels: ORDER.map((k) => BLOCK_LABELS[k]),
        datasets: [
          {
            label: "Score",
            data: dataNormalized,
            backgroundColor: "rgba(56,189,248,0.18)",
            borderColor: "#38bdf8",
            borderWidth: 2,
            pointBackgroundColor: "#38bdf8",
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 1,
            ticks: { display: false, stepSize: 0.25 },
            grid: { color: "rgba(255,255,255,0.08)" },
            angleLines: { color: "rgba(255,255,255,0.08)" },
            pointLabels: { color: "#94a3b8", font: { size: 11 } },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [values]);

  return (
    <div className="radar-chart-container">
      <canvas ref={ref} />
    </div>
  );
}
