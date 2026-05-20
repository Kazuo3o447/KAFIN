import { NextRequest, NextResponse } from "next/server";
import { loadReport } from "@/lib/export/loader";
import { renderReportPdf } from "@/lib/export/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const meta = loadReport(ctx.params.id);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const origin = `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  try {
    const pdf = await renderReportPdf({ reportId: ctx.params.id, origin });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${meta.ticker}_${meta.report.research_date}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "pdf_render_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
