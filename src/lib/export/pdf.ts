/**
 * PDF-Export — rendert /reports/[id]?print=1 mit Puppeteer.
 * Lokal-only (kein Headless-Cloud-Dienst).
 */
import puppeteer from "puppeteer";

export async function renderReportPdf(opts: {
  reportId: string;
  origin: string; // z.B. http://localhost:3000
}): Promise<Buffer> {
  const url = `${opts.origin.replace(/\/$/, "")}/reports/${opts.reportId}?print=1`;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    // Geben Charts (Radar) Zeit zum Rendern.
    await new Promise((r) => setTimeout(r, 600));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "6mm", right: "6mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
