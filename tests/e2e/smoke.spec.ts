import { test, expect } from "@playwright/test";

/**
 * Smoke-Tests für die Kafin-Research-App.
 * Prüft nur Sidebar-Navigation und Erreichbarkeit der Hauptseiten.
 * Setzt keine Run-Pipeline (LLM/Provider) voraus.
 */
test.describe("App-Shell · Smoke", () => {
  test("Startseite rendert Sidebar mit allen Nav-Links", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-sidebar")).toBeVisible();
    await expect(page.locator(".app-sidebar .brand-text")).toContainText("Kafin");
    for (const label of ["Start", "Reports", "Watchlist", "Logs", "Einstellungen"]) {
      await expect(
        page.locator(".app-sidebar .nav-link", { hasText: label }),
      ).toBeVisible();
    }
  });

  test("Reports-Seite ist erreichbar", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.locator("h1")).toContainText(/Reports/i);
  });

  test("Watchlist-Seite ist erreichbar", async ({ page }) => {
    await page.goto("/watchlist");
    await expect(page.locator("h1")).toContainText(/Watchlist/i);
  });

  test("Logs-Seite ist erreichbar", async ({ page }) => {
    await page.goto("/logs");
    await expect(page.locator("h1")).toContainText(/Logs/i);
  });

  test("Settings-Seite ist erreichbar", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText(/Einstellungen/i);
  });
});

test.describe("API · Smoke", () => {
  test("GET /api/watchlist liefert items-Array", async ({ request }) => {
    const r = await request.get("/api/watchlist");
    expect(r.ok()).toBeTruthy();
    const body = (await r.json()) as { items: unknown };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("POST /api/watchlist mit invalid_ticker → 400", async ({ request }) => {
    const r = await request.post("/api/watchlist", {
      data: { ticker: "" },
    });
    expect(r.status()).toBe(400);
  });

  test("Pin/Unpin Roundtrip funktioniert", async ({ request }) => {
    const ticker = "ZZZE2E";
    const create = await request.post("/api/watchlist", {
      data: { ticker, notes: "e2e test" },
    });
    expect(create.ok()).toBeTruthy();

    const list = await request.get("/api/watchlist");
    const body = (await list.json()) as { items: Array<{ ticker: string }> };
    expect(body.items.some((i) => i.ticker === ticker)).toBe(true);

    const del = await request.delete(`/api/watchlist?ticker=${ticker}`);
    expect(del.ok()).toBeTruthy();
  });
});
