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
    ["Score", report.growth_research_score],
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

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}
