import { expect, test } from "@playwright/test";

for (const [locale, title] of [
  ["ru", "Справочник модификаций"],
  ["en", "Modification catalog"],
  ["ka", "მოდიფიკაციების ცნობარი"],
]) {
  test(`${locale} modification catalog is not displayed or requested`, async ({ page }) => {
    const catalogRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/cars/specifications")) catalogRequests.push(request.url());
    });
    await page.goto(`/${locale}`);
    await expect(page.locator('[name="car_price_usd"]')).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await expect(page.locator("#spec-make")).toHaveCount(0);
    await expect(page.getByTestId("power-reference")).toHaveCount(0);
    expect(catalogRequests).toEqual([]);
  });
}

for (const path of ["/ru", "/ru/catalog"]) {
  test(`${path} budget results hide catalog references even when API supplies one`, async ({ page }) => {
    const catalog = await page.request.get(`${process.env.E2E_API_URL ?? "http://localhost:8000"}/cars/specifications`);
    expect(catalog.status()).toBe(200);
    const reference = (await catalog.json()).items[0];
    expect(reference.source_url).toBeTruthy();
    let candidateId: number | null = null;
    await page.route("**/cars/budget", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      data.matches[0].car.power_reference = reference;
      candidateId = data.matches[0].car.car_id;
      await route.fulfill({ response, json: data });
    });
    await page.goto(path);
    if (path === "/ru") await page.getByRole("tab", { name: "Подбор по бюджету", exact: true }).click();
    await page.locator('[name="budget_amount"]').fill("30000");
    const result = page.waitForResponse((response) => response.url().endsWith("/cars/budget") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Подобрать автомобили", exact: true }).click();
    expect((await result).status()).toBe(200);
    await expect(page.getByTestId(`budget-car-${candidateId}`)).toBeVisible();
    await expect(page.getByTestId("power-reference")).toHaveCount(0);
    await expect(page.getByRole("link", { name: reference.source_title, exact: true })).toHaveCount(0);
  });
}
