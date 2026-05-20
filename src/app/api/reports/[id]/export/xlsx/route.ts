import { NextRequest, NextResponse } from "next/server";
import { loadReport } from "@/lib/export/loader";
import { renderReportXlsx } from "@/lib/export/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const meta = loadReport(ctx.params.id);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const buf = await renderReportXlsx(meta.report);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${meta.ticker}_${meta.report.research_date}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "xlsx_render_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
