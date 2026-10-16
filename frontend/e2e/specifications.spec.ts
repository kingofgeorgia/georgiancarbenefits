import { expect, test, type Page } from "@playwright/test";

async function choose(page: Page, make: string, model: string, year: string, entry: string) {
  await page.locator("#spec-make").selectOption(make);
  await page.locator("#spec-model").selectOption(model);
  await page.locator("#spec-year").selectOption(year);
  await page.locator("#spec-entry").selectOption(entry);
}

test("manual modification supplies sourced metric power, calculates and invalidates old results", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ru");
  await page.getByText("Справочник модификаций", { exact: true }).click();
  await choose(page, "BMW", "M4", "2021", "bmw-m4-2021-eu-competition-coupe-xdrive");
  await expect(page.getByRole("region", { name: "Справочник модификаций" }).getByTestId("power-reference").getByRole("link")).toHaveAttribute("href", "https://www.press.bmwgroup.com/global/article/attachment/T0329893EN/477740");
  await page.getByRole("button", { name: "Применить модификацию", exact: true }).click();
  await expect(page.locator('[name="horse_power"]')).toHaveValue("510");
  await expect(page.locator('[name="engine_volume_cc"]')).toHaveValue("2993");
  await expect(page.locator('[name="car_year"]')).toHaveValue("2021");
  await expect(page.getByTestId("applied-specification")).toBeVisible();
  await page.locator('[name="car_price_usd"]').fill("30000");
  const response = page.waitForResponse((r) => r.url().endsWith("/calculator/total") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON()).toMatchObject({ source_make: "BMW", source_model: "M4", horse_power: 510, engine_volume_cc: 2993, auto_market_comparison: false });
  await expect(page.getByText("Таможенный сбор", { exact: true }).first()).toBeVisible();
  await page.locator('[name="horse_power"]').fill("500");
  await expect(page.getByTestId("applied-specification")).toHaveCount(0);
  await expect(page.getByText("Таможенный сбор", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Сбросить расчёт" }).click();
  await expect(page.locator("#spec-make")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Camry versions keep SAE and metric horsepower distinct and never invent exact displacement", async ({ page }) => {
  await page.goto("/ru");
  await page.getByText("Справочник модификаций", { exact: true }).click();
  await choose(page, "Toyota", "Camry", "2020", "toyota-camry-2020-us-le-25-fwd");
  await page.getByRole("button", { name: "Применить модификацию", exact: true }).click();
  await expect(page.locator('[name="horse_power"]')).toHaveValue("205.82");
  await expect(page.locator('[name="engine_volume_cc"]')).toHaveValue("0");
  await page.locator("#spec-entry").selectOption("toyota-camry-2020-us-xse-25-fwd");
  await page.getByRole("button", { name: "Применить модификацию", exact: true }).click();
  await expect(page.locator('[name="horse_power"]')).toHaveValue("208.86");
  await page.locator('[name="engine_volume_cc"]').fill("2487");
  await expect(page.getByTestId("applied-specification")).toBeVisible();
  await page.locator("#spec-model").selectOption("RAV4");
  await expect(page.locator("#spec-year")).toHaveValue("");
  await expect(page.locator("#spec-entry")).toBeDisabled();
});

test("hybrid system power never becomes regulatory or engine power and a different car clears listing data", async ({ page }) => {
  await page.goto("/ru");
  await page.getByPlaceholder(/https:\/\/www.myauto.ge/).fill("1001");
  await page.getByRole("button", { name: "Загрузить авто", exact: true }).click();
  await expect(page.locator('[name="car_price_usd"]')).toHaveValue("30000");
  await page.getByText("Справочник модификаций", { exact: true }).click();
  await choose(page, "Toyota", "RAV4", "2024", "toyota-rav4-2024-us-hybrid-le-awd");
  await page.getByRole("button", { name: "Применить модификацию", exact: true }).click();
  await expect(page.locator('[name="horse_power"]')).toHaveValue("");
  await expect(page.locator('[name="car_price_usd"]')).toHaveValue("0");
  await expect(page.locator('[name="powertrain_kind"]')).toHaveValue("OTHER_HYBRID");
  await expect(page.getByTestId("applied-specification")).toContainText("Системная или пиковая мощность не подставляется");
  await page.locator('[name="powertrain_kind"]').selectOption("EV");
  await expect(page.locator('[name="electric_power_kw"]')).toHaveValue("");
  await expect(page.getByTestId("applied-specification")).toHaveCount(0);
});

test("catalog failure is visible and retry works", async ({ page }) => {
  await page.goto("/ru");
  await page.route("**/cars/specifications", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.getByText("Справочник модификаций", { exact: true }).click();
  const region = page.getByRole("region", { name: "Справочник модификаций" });
  await expect(region.getByRole("alert")).toBeVisible();
  await page.unroute("**/cars/specifications");
  await region.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.locator("#spec-make")).toBeVisible();
});

for (const [locale, title, apply] of [
  ["ru", "Справочник модификаций", "Применить модификацию"],
  ["en", "Modification catalog", "Apply modification"],
  ["ka", "მოდიფიკაციების ცნობარი", "მოდიფიკაციის გამოყენება"],
]) {
  test(`${locale} sourced modification fits mobile`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${locale}`);
    await page.getByText(title, { exact: true }).click();
    await choose(page, "Toyota", "RAV4", "2024", "toyota-rav4-2024-us-le-25-fwd");
    await page.getByRole("button", { name: apply, exact: true }).click();
    await expect(page.locator('[name="horse_power"]')).toHaveValue("205.82");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await info.attach(`modification-${locale}-mobile`, { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
  });
}
