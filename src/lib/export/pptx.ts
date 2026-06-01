/**
 * PPTX-Export — kompakte Slide-Deck-Variante (5 Slides).
 *  1. Cover (Ticker, Company, Score, Gate, Category)
 *  2. Score-Breakdown (Tabelle 7 Blöcke)
 *  3. Bull / Bear
 *  4. Catalysts / Hard Blockers / Open Questions
 *  5. Quellen (Top 12)
 */
import PptxGenJS from "pptxgenjs";
import type { Report } from "@/lib/schemas/report";
import { BLOCK_LABELS, BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";

const NAVY = "0F172A";
const ACCENT = "38BDF8";
const PRIMARY = "0050B3";
const TEXT = "E2E8F0";
const MUTED = "94A3B8";
const GREEN = "22C55E";
const YELLOW = "F59E0B";
const RED = "EF4444";

const GATE_COLOR: Record<string, string> = { Green: GREEN, Yellow: YELLOW, Red: RED };

export async function renderReportPptx(report: Report): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in

  // Globaler Hintergrund
  pptx.defineSlideMaster({
    title: "KAFIN_DARK",
    background: { color: NAVY },
    objects: [
      {
        rect: {
          x: 0,
          y: 7.2,
          w: 13.33,
          h: 0.05,
          fill: { color: ACCENT },
        },
      },
      {
        text: {
          text: "Kafin Research · vertraulich · v0.1",
          options: {
            x: 0.4,
            y: 7.05,
            w: 12.5,
            h: 0.3,
            fontSize: 9,
            color: MUTED,
            fontFace: "Inter",
          },
        },
      },
    ],
  });

  // 1. Cover
  const s1 = pptx.addSlide({ masterName: "KAFIN_DARK" });
  s1.addText(report.ticker, {
    x: 0.5,
    y: 0.5,
    w: 12,
    h: 1.2,
    fontSize: 64,
    bold: true,
    color: ACCENT,
    fontFace: "Inter",
  });
  s1.addText(report.company_name || "—", {
    x: 0.5,
    y: 1.7,
    w: 12,
    h: 0.6,
    fontSize: 28,
    color: TEXT,
    fontFace: "Inter",
  });
  s1.addText(`${report.sector} · ${report.industry} · ${report.exchange}`, {
    x: 0.5,
    y: 2.3,
    w: 12,
    h: 0.5,
    fontSize: 14,
    color: MUTED,
    fontFace: "Inter",
  });

  s1.addText(String(Math.round(report.growth_research_score ?? 0)), {
    x: 0.5,
    y: 3.5,
    w: 4,
    h: 2,
    fontSize: 120,
    bold: true,
    color: GATE_COLOR[report.gate] ?? TEXT,
    fontFace: "Inter",
  });
  s1.addText("/ 100 Growth-Research-Score", {
    x: 0.5,
    y: 5.5,
    w: 6,
    h: 0.4,
    fontSize: 12,
    color: MUTED,
    fontFace: "Inter",
  });

  s1.addText(
    [
      { text: "Gate · ", options: { color: MUTED, fontSize: 14 } },
      {
        text: report.gate,
        options: { color: GATE_COLOR[report.gate] ?? TEXT, fontSize: 22, bold: true },
      },
    ],
    { x: 5.5, y: 3.6, w: 7.3, h: 0.6, fontFace: "Inter" },
  );
  s1.addText(
    [
      { text: "Kategorie · ", options: { color: MUTED, fontSize: 14 } },
      { text: report.category, options: { color: TEXT, fontSize: 22, bold: true } },
    ],
    { x: 5.5, y: 4.2, w: 7.3, h: 0.6, fontFace: "Inter" },
  );
  s1.addText(
    [
      { text: "Confidence · ", options: { color: MUTED, fontSize: 14 } },
      { text: report.confidence, options: { color: TEXT, fontSize: 22, bold: true } },
    ],
    { x: 5.5, y: 4.8, w: 7.3, h: 0.6, fontFace: "Inter" },
  );

  s1.addText(`Stand: ${report.research_date}`, {
    x: 0.5,
    y: 6.4,
    w: 12,
    h: 0.4,
    fontSize: 12,
    color: MUTED,
    fontFace: "Inter",
  });

  // 2. Score-Breakdown
  const s2 = pptx.addSlide({ masterName: "KAFIN_DARK" });
  s2.addText("Score-Breakdown", {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: TEXT,
    fontFace: "Inter",
  });
  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "Block", options: { bold: true, color: TEXT, fill: { color: PRIMARY } } },
      { text: "Erreicht", options: { bold: true, color: TEXT, fill: { color: PRIMARY } } },
      { text: "Max", options: { bold: true, color: TEXT, fill: { color: PRIMARY } } },
      { text: "%", options: { bold: true, color: TEXT, fill: { color: PRIMARY } } },
    ],
    ...(Object.keys(BLOCK_WEIGHTS) as BlockKey[]).map((k): PptxGenJS.TableRow => {
      const got = report.score_breakdown[k];
      const max = BLOCK_WEIGHTS[k];
      const pct = ((got / max) * 100).toFixed(0) + "%";
      return [
        { text: BLOCK_LABELS[k], options: { color: TEXT } },
        { text: got.toFixed(1), options: { color: TEXT } },
        { text: String(max), options: { color: MUTED } },
        { text: pct, options: { color: ACCENT, bold: true } },
      ];
    }),
  ];
  s2.addTable(rows, {
    x: 0.5,
    y: 1.2,
    w: 12.3,
    fontSize: 14,
    fontFace: "Inter",
    border: { type: "solid", color: "1E293B", pt: 1 },
  });

  // 3. Bull / Bear
  const s3 = pptx.addSlide({ masterName: "KAFIN_DARK" });
  s3.addText("Bull · Bear", {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: TEXT,
    fontFace: "Inter",
  });
  s3.addText("Bull Case", {
    x: 0.5,
    y: 1.1,
    w: 6,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: GREEN,
    fontFace: "Inter",
  });
  s3.addText(
    (report.bull_case.length ? report.bull_case : ["—"]).map((b) => ({
      text: `• ${b}`,
      options: { color: TEXT, fontSize: 12, breakLine: true },
    })),
    { x: 0.5, y: 1.6, w: 6, h: 5.4, fontFace: "Inter", valign: "top" },
  );
  s3.addText("Bear Case", {
    x: 6.8,
    y: 1.1,
    w: 6,
    h: 0.5,
    fontSize: 16,
    bold: true,
    color: RED,
    fontFace: "Inter",
  });
  s3.addText(
    (report.bear_case.length ? report.bear_case : ["—"]).map((b) => ({
      text: `• ${b}`,
      options: { color: TEXT, fontSize: 12, breakLine: true },
    })),
    { x: 6.8, y: 1.6, w: 6, h: 5.4, fontFace: "Inter", valign: "top" },
  );

  // 4. Catalysts / Hard Blockers / Open
  const s4 = pptx.addSlide({ masterName: "KAFIN_DARK" });
  s4.addText("Katalysatoren · Risiken", {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: TEXT,
    fontFace: "Inter",
  });
  const triples: [string, string, string[]][] = [
    ["Katalysatoren", ACCENT, report.catalysts],
    ["Hard Blockers", RED, report.hard_blockers],
    ["Offene Fragen", YELLOW, report.open_questions],
  ];
  triples.forEach(([label, color, items], i) => {
    const x = 0.5 + i * 4.2;
    s4.addText(label, {
      x,
      y: 1.1,
      w: 4,
      h: 0.5,
      fontSize: 16,
      bold: true,
      color,
      fontFace: "Inter",
    });
    s4.addText(
      (items.length ? items : ["—"]).map((it) => ({
        text: `• ${it}`,
        options: { color: TEXT, fontSize: 11, breakLine: true },
      })),
      { x, y: 1.6, w: 4, h: 5.4, fontFace: "Inter", valign: "top" },
    );
  });

  // 5. Sources
  const s5 = pptx.addSlide({ masterName: "KAFIN_DARK" });
  s5.addText("Quellen", {
    x: 0.5,
    y: 0.4,
    w: 12,
    h: 0.6,
    fontSize: 28,
    bold: true,
    color: TEXT,
    fontFace: "Inter",
  });
  const top = report.source_list.slice(0, 14);
  s5.addText(
    top.length === 0
      ? [{ text: "— keine Quellen erfasst —", options: { color: MUTED, fontSize: 12 } }]
      : top.map((src) => ({
          text: `[${src.idx}] (${src.class}) ${src.title || src.url}`,
          options: {
            color: TEXT,
            fontSize: 11,
            breakLine: true,
            hyperlink: { url: src.url },
          },
        })),
    { x: 0.5, y: 1.1, w: 12.3, h: 6, fontFace: "Inter", valign: "top" },
  );

  const arr = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return arr;
}
