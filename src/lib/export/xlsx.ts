/**
 * XLSX-Export — schreibt eine Workbook mit Tabs Overview / KeyMetrics / Scoring / Sources.
 */
import ExcelJS from "exceljs";
import type { Report } from "@/lib/schemas/report";
import { BLOCK_LABELS, BLOCK_WEIGHTS, type BlockKey } from "@/lib/scoring/weights";

export async function renderReportXlsx(report: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kafin Research";
  wb.created = new Date();

  // ---- Overview ----
  const ov = wb.addWorksheet("Overview");
  ov.columns = [
    { header: "Feld", key: "k", width: 30 },
    { header: "Wert", key: "v", width: 60 },
  ];
  const overviewRows: [string, string | number | boolean][] = [
    ["Ticker", report.ticker],
    ["Company", report.company_name],
    ["Exchange", report.exchange],
    ["Sektor", report.sector],
    ["Industrie", report.industry],
    ["Research-Datum", report.research_date],
    ["Kategorie", report.category],
    ["Gate", report.gate],
    ["Score", report.growth_research_score ?? "n/a"],
    ["Confidence", report.confidence],
    ["Handoff to Trade Engine", report.handoff_to_trade_engine],
    ["Thesis", report.thesis_summary],
  ];
  overviewRows.forEach(([k, v]) => ov.addRow({ k, v }));
  ov.getRow(1).font = { bold: true };

  // Bull / Bear / Catalysts / Open / Falsification / Hard Blockers
  const lists = wb.addWorksheet("Narrative");
  lists.columns = [
    { header: "Kategorie", key: "k", width: 20 },
    { header: "Eintrag", key: "v", width: 100 },
  ];
  function addList(label: string, items: string[]) {
    if (items.length === 0) {
      lists.addRow({ k: label, v: "—" });
      return;
    }
    items.forEach((it) => lists.addRow({ k: label, v: it }));
  }
  addList("Bull Case", report.bull_case);
  addList("Bear Case", report.bear_case);
  addList("Katalysatoren", report.catalysts);
  addList("Hard Blockers", report.hard_blockers);
  addList("Offene Fragen", report.open_questions);
  addList("Falsifikations-Tests", report.falsification_tests);
  lists.getRow(1).font = { bold: true };

  // ---- Key Metrics ----
  const km = wb.addWorksheet("KeyMetrics");
  km.columns = [
    { header: "Metrik", key: "k", width: 30 },
    { header: "Wert", key: "v", width: 20 },
  ];
  Object.entries(report.key_metrics).forEach(([k, v]) => km.addRow({ k, v }));
  km.getRow(1).font = { bold: true };

  // ---- Scoring ----
  const sc = wb.addWorksheet("Scoring");
  sc.columns = [
    { header: "Block", key: "block", width: 36 },
    { header: "Erreicht", key: "got", width: 12 },
    { header: "Maximum", key: "max", width: 12 },
    { header: "%", key: "pct", width: 10 },
  ];
  (Object.keys(BLOCK_WEIGHTS) as BlockKey[]).forEach((k) => {
    const got = report.score_breakdown[k];
    const max = BLOCK_WEIGHTS[k];
    sc.addRow({ block: BLOCK_LABELS[k], got, max, pct: ((got / max) * 100).toFixed(1) });
  });
  sc.addRow({ block: "Gesamt", got: report.growth_research_score, max: 100, pct: report.growth_research_score });
  sc.getRow(1).font = { bold: true };
  sc.lastRow!.font = { bold: true };

  // ---- Sources ----
  const src = wb.addWorksheet("Sources");
  src.columns = [
    { header: "Idx", key: "idx", width: 6 },
    { header: "Klasse", key: "klass", width: 8 },
    { header: "Titel", key: "title", width: 50 },
    { header: "URL", key: "url", width: 70 },
  ];
  report.source_list.forEach((s) =>
    src.addRow({ idx: s.idx, klass: s.class, title: s.title ?? "", url: s.url }),
  );
  src.getRow(1).font = { bold: true };

  // ---- Fair Value (Phase F.5) ----
  if (report.fair_value) {
    const fv = report.fair_value;
    const fvSheet = wb.addWorksheet("Fair Value");
    fvSheet.columns = [
      { header: "Methode / Feld", key: "k", width: 32 },
      { header: "Wert", key: "v", width: 20 },
      { header: "Gewicht", key: "w", width: 12 },
      { header: "Anmerkung", key: "note", width: 40 },
    ];
    fvSheet.getRow(1).font = { bold: true };

    // Method rows
    fv.methods.forEach((m) => {
      fvSheet.addRow({
        k: m.name,
        v: m.value != null ? m.value.toFixed(2) : "—",
        w: m.weight != null ? m.weight.toFixed(3) : "—",
        note: m.applicable ? "" : "nicht anwendbar",
      });
    });

    // Reverse-DCF row
    if (fv.reverse_dcf) {
      fvSheet.addRow({
        k: "Reverse DCF (impl. FCF-CAGR)",
        v: fv.reverse_dcf.implied_fcf_cagr != null ? (fv.reverse_dcf.implied_fcf_cagr * 100).toFixed(1) + "%" : "—",
        w: "",
        note: fv.reverse_dcf.classification ?? "",
      });
    }

    // Summary rows
    fvSheet.addRow({});
    fvSheet.addRow({ k: "Aktueller Kurs", v: fv.current_price ?? "—" });
    fvSheet.addRow({ k: "Fair-Value-Schätzung", v: fv.point_estimate ?? "—" });
    fvSheet.addRow({ k: "Bereich", v: fv.range_low != null && fv.range_high != null ? `${fv.range_low.toFixed(2)} – ${fv.range_high.toFixed(2)}` : "—" });
    fvSheet.addRow({ k: "Upside/Downside", v: fv.upside_pct != null ? (fv.upside_pct * 100).toFixed(1) + "%" : "—" });
    fvSheet.addRow({ k: "Klassifizierung", v: fv.classification ?? "—" });
    fvSheet.addRow({ k: "Konfidenz", v: fv.confidence });
    fvSheet.addRow({ k: "Anzahl Methoden", v: fv.applicable_method_count });
    fvSheet.addRow({ k: "Rationale", v: fv.rationale_short });
  }

  // ---- Verdict (Phase F.5) ----
  if (report.verdict) {
    const vd = wb.addWorksheet("Verdict");
    vd.columns = [
      { header: "Feld", key: "k", width: 24 },
      { header: "Wert", key: "v", width: 80 },
    ];
    vd.getRow(1).font = { bold: true };
    vd.addRow({ k: "Label", v: report.verdict.label });
    vd.addRow({ k: "Reason Code", v: report.verdict.reason_code });
    vd.addRow({ k: "Schwächster Block", v: report.verdict.weakest_block ?? "—" });
    vd.addRow({ k: "Detail", v: report.verdict.detail });
  }

  // ---- Drei-Achsen (P3) ----
  if (report.axes && report.axes.length > 0) {
    const ax = wb.addWorksheet("Axes");
    ax.columns = [
      { header: "Achse", key: "axis", width: 10 },
      { header: "Quant Score", key: "quant", width: 14 },
      { header: "KI Score", key: "ki", width: 10 },
      { header: "Kombiniert", key: "combined", width: 12 },
      { header: "Divergenz", key: "divergence", width: 12 },
      { header: "KI-Gewicht", key: "kiWeight", width: 12 },
      { header: "Rating", key: "rating", width: 22 },
      { header: "Quant Coverage", key: "coverage", width: 16 },
      { header: "Safety Status", key: "safety", width: 14 },
    ];
    ax.getRow(1).font = { bold: true };
    for (const a of report.axes) {
      ax.addRow({
        axis: a.axis.toUpperCase(),
        quant: a.quant.value !== null ? a.quant.value.toFixed(1) : "n/a",
        ki: a.ki?.value !== null && a.ki !== null ? (a.ki.value as number).toFixed(1) : "—",
        combined: a.combined !== null ? a.combined.toFixed(1) : "n/a",
        divergence: a.divergence !== null ? a.divergence.toFixed(1) : "—",
        kiWeight: (a.kiWeightEffective * 100).toFixed(0) + "%",
        rating: a.rating ?? "—",
        coverage: (a.quant.coverage * 100).toFixed(0) + "%",
        safety: "",
      });
    }
    // Safety gate summary row
    if (report.safety_gate) {
      ax.addRow({});
      ax.addRow({ axis: "Safety Gate", quant: report.safety_gate.status.toUpperCase(), rating: report.safety_gate.reasons.join("; ") || "—" });
    }
  }

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
