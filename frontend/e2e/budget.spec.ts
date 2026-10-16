import { expect, test, type Page } from "@playwright/test";
import type { BudgetSearchResult } from "../src/lib/types";

async function submit(page: Page): Promise<BudgetSearchResult> {
  const response = page.waitForResponse((r) => r.url().endsWith("/cars/budget") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Подобрать автомобили", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  return result.json();
}

test("purchase mode filters listing prices without import costs and survives tab switches", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ru");
  await page.locator('[name="car_price_usd"]').fill("12345");
  await page.getByRole("tab", { name: "Подбор по бюджету" }).click();
  await page.locator('[name="budget_amount"]').fill("25000");
  const data = await submit(page);
  expect(data.request.mode).toBe("GEORGIA_PURCHASE");
  expect(data.rates).toBeNull();
  expect(data.matches.map((item) => item.car.car_id)).toEqual([1004, 1002]);
  expect(data.matches.every((item) => item.breakdown === null)).toBe(true);
  await expect(page.getByTestId("budget-car-1001")).toHaveCount(0);
  await expect(page.getByTestId("budget-car-1002")).toBeVisible();
  await expect(page.getByText("Остаток бюджета", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Калькулятор", exact: true }).click();
  await expect(page.locator('[name="car_price_usd"]')).toHaveValue("12345");
  await page.getByRole("tab", { name: "Подбор по бюджету" }).click();
  await expect(page.locator('[name="budget_amount"]')).toHaveValue("25000");
  await expect(page.getByTestId("budget-car-1002")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Russia total includes entered costs, separates missing power and shows breakdown", async ({ page }, info) => {
  await page.goto("/ru/catalog");
  await page.getByRole("radio", { name: "С доставкой и оформлением в России" }).check();
  await expect(page.locator('[name="budget_currency"]')).toHaveValue("RUB");
  await page.locator('[name="budget_amount"]').fill("4500000");
  const registration = page.getByLabel("Брокер, документы и регистрация, ₽", { exact: true });
  await expect(registration).toHaveAccessibleDescription("Сумма по вашей смете, без доставки, таможенных платежей и утильсбора.");
  await registration.fill("30000");
  const data = await submit(page);
  expect(data.matches.map((item) => item.car.car_id).sort()).toEqual([1001, 1002]);
  expect(data.needs_details.map((item) => item.car.car_id).sort()).toEqual([1003, 1004]);
  for (const item of data.matches) {
    const b = item.breakdown!;
    expect(b.registration_cost_rub).toBe(30000);
    expect(b.logistics_cost_rub).toBe(170000);
    expect(b.total_rub).toBeCloseTo(b.purchase_rub + b.customs_fee_rub + b.customs_duty_rub + b.recycling_fee_rub + 200000, 2);
    expect(item.cost_in_budget_currency).toBeLessThanOrEqual(data.request.budget_amount);
    expect(item.remaining_budget).toBeCloseTo(data.request.budget_amount - item.cost_in_budget_currency!, 2);
  }
  const ev = page.getByTestId("budget-car-1003");
  await expect(ev.getByText("Требуется уточнение", { exact: true })).toBeVisible();
  await expect(ev.getByText("Остаток бюджета", { exact: true })).toHaveCount(0);
  await page.getByTestId("budget-car-1001").locator("summary").click();
  await expect(page.getByTestId("budget-car-1001").getByText("Брокер, документы и регистрация", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await info.attach("budget-russia-desktop", { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
});

test("mode, currency and filter edits clear old results without automatic requests", async ({ page }) => {
  let calls = 0;
  page.on("request", (r) => { if (r.url().endsWith("/cars/budget") && r.method() === "POST") calls++; });
  await page.goto("/ru/catalog");
  await page.locator('[name="budget_amount"]').fill("30000");
  await submit(page);
  await page.getByRole("radio", { name: "С доставкой и оформлением в России" }).check();
  await expect(page.getByTestId("budget-car-1001")).toHaveCount(0);
  await expect(page.locator('[name="budget_amount"]')).toHaveValue("");
  expect(calls).toBe(1);
  await page.locator('[name="budget_amount"]').fill("3000000");
  expect(await page.locator('[name="registration_cost_rub"]').evaluate((element) => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
  await page.locator('[name="registration_cost_rub"]').fill("0");
  await submit(page);
  await page.locator('[name="budget_currency"]').selectOption("USD");
  await expect(page.locator('[name="budget_amount"]')).toHaveValue("");
  await expect(page.getByTestId("budget-car-1002")).toHaveCount(0);
  expect(calls).toBe(2);
});

test("pagination appends unique candidates and sorting needs no new requests", async ({ page }) => {
  await page.goto("/ru/catalog");
  await page.locator('[name="budget_amount"]').fill("30000");
  await submit(page);
  const next = page.waitForResponse((r) => r.url().endsWith("/cars/budget") && r.request().postDataJSON()?.page === 2);
  await page.getByRole("button", { name: "Проверить следующие объявления" }).click();
  expect((await next).status()).toBe(200);
  await expect(page.getByTestId("budget-car-1005")).toBeVisible();
  await expect(page.locator('[data-testid^="budget-car-"]')).toHaveCount(5);
  await page.getByLabel("Сортировка", { exact: true }).selectOption("year");
  await expect(page.getByTestId("budget-car-1001")).toHaveCount(1);
});

test("provider failure is visible and retry restores results", async ({ page }) => {
  await page.goto("/ru/catalog");
  await page.route("**/cars/budget", (route) => route.fulfill({ status: 503, json: { detail: { code: "MYAUTO_UNAVAILABLE" } } }));
  await page.locator('[name="budget_amount"]').fill("30000");
  await page.getByRole("button", { name: "Подобрать автомобили", exact: true }).click();
  await expect(page.getByRole("region", { name: "Подбор по бюджету", exact: true }).getByRole("alert")).toHaveText("Поиск MyAuto временно недоступен. Попробуйте позже.");
  await expect(page.getByText("В проверенных объявлениях подходящих вариантов нет.")).toHaveCount(0);
  await page.unroute("**/cars/budget");
  await submit(page);
  await expect(page.getByTestId("budget-car-1001")).toBeVisible();
});

for (const copy of [
  { locale: "ru", title: "Подбор по бюджету", mode: "Только покупка в Грузии", search: "Подобрать автомобили", registration: "Брокер, документы и регистрация, ₽", help: "Сумма по вашей смете, без доставки, таможенных платежей и утильсбора." },
  { locale: "en", title: "Budget car search", mode: "Purchase in Georgia only", search: "Find cars", registration: "Broker, documents and registration, RUB", help: "Your quoted costs, excluding delivery, customs payments and the recycling fee." },
  { locale: "ka", title: "ბიუჯეტით შერჩევა", mode: "მხოლოდ შეძენა საქართველოში", search: "ავტომობილების მოძიება", registration: "ბროკერი, დოკუმენტები და რეგისტრაცია, RUB", help: "თანხა თქვენი ხარჯთაღრიცხვით, მიწოდების, საბაჟო გადასახადებისა და უტილიზაციის მოსაკრებლის გარეშე." },
]) {
  test(`${copy.locale} budget selection fits a 320px screen`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${copy.locale}`);
    await page.getByRole("tab", { name: copy.title, exact: true }).click();
    await expect(page.getByRole("radio", { name: copy.mode })).toBeChecked();
    await page.getByRole("radio").nth(1).check();
    const registration = page.getByLabel(copy.registration, { exact: true });
    await expect(registration).toBeVisible();
    await expect(registration).toHaveAccessibleDescription(copy.help);
    await expect(page.locator("#budget-registration-help")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (copy.locale === "ru") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await info.attach("budget-russia-mobile-form", { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
    }
    await page.getByRole("radio", { name: copy.mode }).check();
    await page.locator('[name="budget_amount"]').fill("25000");
    const response = page.waitForResponse((r) => r.url().endsWith("/cars/budget") && r.request().method() === "POST");
    await page.getByRole("button", { name: copy.search, exact: true }).click();
    expect((await response).status()).toBe(200);
    await expect(page.getByTestId("budget-car-1002")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (copy.locale === "ru") await info.attach("budget-georgia-mobile", { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}
