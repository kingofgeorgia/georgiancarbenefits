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
