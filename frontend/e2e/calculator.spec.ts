import { expect, test, type Page } from "@playwright/test";
import type { CalculatorRequest, CalculatorResult, DealShareOut } from "../src/lib/types";

const field = (page: Page, name: string) => page.locator(`[name="${name}"]`);
const myauto = (page: Page) => page.getByPlaceholder(/https:\/\/www.myauto.ge/);
const vin = (page: Page) => page.getByPlaceholder(/17-значный VIN/);
const shareButton = (page: Page) => page.getByRole("button", { name: "Поделиться расчётом" });
const runtimeErrors = new WeakMap<Page, string[]>();
const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);

async function expectRow(page: Page, label: string | RegExp, value: number) {
  await expect(page.getByText(label, { exact: true }).locator("..")).toContainText(rub(value));
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 12).map((element) => ({ tag: element.tagName, class: element.className, text: element.textContent?.slice(0, 80) })),
  }));
  expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.width);
}

async function screenshot(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
  return page.screenshot({ fullPage: true });
}

async function load(page: Page, source: string) {
  await myauto(page).fill(source);
  const response = page.waitForResponse((r) => r.url().endsWith("/cars/from-url") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Загрузить авто" }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole("button", { name: "Загрузить авто" })).toBeEnabled();
}

async function calculate(page: Page): Promise<CalculatorResult> {
  const response = page.waitForResponse((r) => r.url().endsWith("/calculator/total") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(shareButton(page)).toBeVisible();
  return result.json();
}

async function share(page: Page) {
  const response = page.waitForResponse((r) => r.url().endsWith("/deals/") && r.request().method() === "POST");
  await shareButton(page).click();
  const created = await response;
  expect(created.status()).toBe(201);
  return { created: await created.json(), payload: created.request().postDataJSON() };
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ru");
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

test("MyAuto URL and ID normalize to the same vehicle", async ({ page }) => {
  await load(page, "https://www.myauto.ge/ru/pr/1001/example?offerType=basic");
  await expect(field(page, "car_price_usd")).toHaveValue("30000");
  await expect(field(page, "horse_power")).toHaveValue("150");
  await page.getByRole("button", { name: "Сбросить расчёт" }).click();
  await load(page, "1001");
  await expect(field(page, "engine_volume_cc")).toHaveValue("1998");
  await expect(field(page, "mileage_km")).toHaveValue("25000");
});

for (const scenario of [
  { kind: "ICE", id: "1001" },
  { kind: "OTHER_HYBRID", id: "1002" },
  { kind: "SERIES_HYBRID", id: "1002" },
  { kind: "EV", id: "1003" },
] as const) {
  test(`${scenario.kind} taxes reconcile with the displayed and shared total`, async ({ page, context }, testInfo) => {
    await load(page, scenario.id);
    await field(page, "powertrain_kind").selectOption(scenario.kind);
    if (["EV", "SERIES_HYBRID"].includes(scenario.kind)) {
      await field(page, "electric_power_kw").fill("153");
    }
    const result = await calculate(page);
    expect(result.customs_total_rub).toBeCloseTo(result.customs_fee_rub + result.customs_duty_rub + result.recycling_fee_rub, 2);
    expect(result.total_cost_rub).toBeCloseTo(result.car_price_rub + result.customs_total_rub + result.logistics_cost_rub, 2);
    expect(result.recycling_fee_rub).toBe({ ICE: 3400, OTHER_HYBRID: 5200, SERIES_HYBRID: 3024000, EV: 2193600 }[scenario.kind]);
    await expectRow(page, "Таможенный сбор", result.customs_fee_rub);
    await expectRow(page, "Утилизационный сбор", result.recycling_fee_rub);
    await expectRow(page, "Общая растаможка", result.customs_total_rub);
    await expectRow(page, "Итого к оплате", result.total_cost_rub);
    if (scenario.kind === "EV") {
      expect(result.customs_payment_kind).toBe("AGGREGATE_PAYMENT");
      expect(result.import_duty_rub).toBe(405000);
      expect(result.excise_rub).toBe(208852.08);
      expect(result.vat_rub).toBe(729047.46);
      expect(result.customs_duty_rub).toBe(1342899.54);
      await expect(page.getByText("НДС (22%)", { exact: true })).toBeVisible();
      await expect(page.getByText(/Акциз \(с мощности/)).toBeVisible();
      await expectRow(page, "Ввозная пошлина", result.import_duty_rub);
      await expectRow(page, /Акциз \(с мощности/, result.excise_rub);
      await expectRow(page, "НДС (22%)", result.vat_rub);
    } else {
      expect(result.customs_payment_kind).toBe("UNIFIED_RATE");
      expect(result.excise_rub).toBe(0);
      expect(result.vat_rub).toBe(0);
      expect(result.customs_duty_rub).toBe(scenario.kind === "ICE" ? 1296000 : 449500);
      await expect(page.getByText("Единая таможенная ставка", { exact: true })).toBeVisible();
      await expectRow(page, "Единая таможенная ставка", result.customs_duty_rub);
    }
    const { created, payload } = await share(page);
    expect(payload.result).toEqual(result);
    const fresh = await context.browser()!.newContext();
    const publicPage = await fresh.newPage();
    const publicErrors: string[] = [];
    publicPage.on("pageerror", (error) => publicErrors.push(error.message));
    await publicPage.goto(`${new URL(page.url()).origin}/ru/deal/${created.public_id}`);
    await expect(publicPage.getByText("Итого к оплате", { exact: true })).toBeVisible();
    await expectRow(publicPage, "Итого к оплате", result.total_cost_rub);
    const href = await publicPage.getByRole("link", { name: "Заказать этот автомобиль через MileON" }).getAttribute("href");
    expect(new URL(href!).searchParams.get("text")).toContain(`${new URL(page.url()).origin}/ru/deal/${created.public_id}`);
    const snapshot = await publicPage.request.get(`${process.env.E2E_API_URL ?? "http://localhost:8000"}/deals/${created.public_id}`);
    const saved: DealShareOut = await snapshot.json();
    expect(saved.snapshot.result).toEqual(result);
    if (scenario.kind === "EV") {
      await testInfo.attach("desktop-ev-result", { body: await screenshot(page), contentType: "image/png" });
      await publicPage.setViewportSize({ width: 390, height: 844 });
      await testInfo.attach("mobile-shared-deal", { body: await screenshot(publicPage), contentType: "image/png" });
      await expectNoHorizontalOverflow(publicPage);
    }
    expect(publicErrors).toEqual([]);
    await fresh.close();
  });
}

test("manual edits and vehicle switches cannot mix Share Deal data", async ({ page }) => {
  await load(page, "1001");
  await field(page, "car_price_usd").fill("31000");
  await field(page, "car_year").fill(String(new Date().getFullYear() - 1));
  await field(page, "mileage_km").fill("27123");
  const result = await calculate(page);
  await field(page, "car_price_usd").fill("32000");
  const { payload } = await share(page);
  expect(payload.request.car_price_usd).toBe(31000);
  expect(payload.vehicle.price_usd).toBe(31000);
  expect(payload.vehicle.year).toBe(payload.request.car_year);
  expect(payload.vehicle.mileage_km).toBe(27123);
  expect(payload.result).toEqual(result);
  await load(page, "1002");
  await expect(shareButton(page)).toHaveCount(0);
  await calculate(page);
  const next = await share(page);
  expect(next.payload.vehicle.make).toBe("Toyota");
  expect(next.payload.request.source_make).toBe("Toyota");
});

test("Share Deal copies the current-origin URL and recovers from a create error", async ({ page }) => {
  await load(page, "1001");
  await calculate(page);
  await page.route("**/deals/", (route) => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await shareButton(page).click();
  await expect(page.getByText("Сервис временно недоступен. Попробуйте немного позже.", { exact: true })).toBeVisible();
  await expect(shareButton(page)).toBeEnabled();
  await page.unroute("**/deals/");
  const { created } = await share(page);
  await expect(page.getByText("Публичная ссылка скопирована", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/ru/deal/${created.public_id}`);
});

test("EV VIN requires regulatory power and produces a readable mobile result", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await vin(page).fill("5YJ3E1EA0SF004091");
  await page.getByRole("button", { name: "Расшифровать VIN" }).click();
  await expect(field(page, "powertrain_kind")).toHaveValue("EV");
  await expect(field(page, "electric_power_kw")).toHaveValue("");
  await field(page, "car_price_usd").fill("30000");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  await expect(page.getByText("Обязательное поле", { exact: true })).toBeVisible();
  await field(page, "electric_power_kw").fill("153");
  const result = await calculate(page);
  expect(result.power_basis).toBe("MAX_30_MINUTE_ELECTRIC_POWER_KW");
  expect(result.power_kw_used).toBe(153);
  await testInfo.attach("mobile-ev-result", { body: await screenshot(page), contentType: "image/png" });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoHorizontalOverflow(page);
});

test("exact MyAuto mileage remains calculable after manual missing-horsepower entry", async ({ page }) => {
  await load(page, "1001");
  await load(page, "1004");
  await expect(field(page, "horse_power")).toHaveValue("");
  await expect(field(page, "mileage_km")).toHaveValue("140851");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  await expect(page.getByText("Обязательное поле", { exact: true })).toBeVisible();
  await field(page, "horse_power").fill("150");
  await calculate(page);
  const { payload } = await share(page);
  expect(payload.request.mileage_km).toBe(140851);
  expect(payload.vehicle.make).toBe("Hyundai");
});

test("VIN autofill clears missing old specs and provides WhatsApp identity", async ({ page }) => {
  await load(page, "1001");
  await vin(page).fill("1HGCM82633A004352");
  await page.getByRole("button", { name: "Расшифровать VIN" }).click();
  await expect(field(page, "engine_volume_cc")).toHaveValue("2999");
  await expect(field(page, "car_price_usd")).toHaveValue("0");
  await field(page, "car_price_usd").fill("10000");
  await calculate(page);
  const href = await page.getByRole("link", { name: "Заказать через MileON", exact: true }).getAttribute("href");
  const message = new URL(href!).searchParams.get("text");
  expect(message).toContain("HONDA Accord 2003");
  expect(message).toContain("1HGCM82633A004352");
  const { payload } = await share(page);
  expect(payload.vehicle.vin).toBe("1HGCM82633A004352");
  expect(payload.vehicle.source_url).toBeNull();
  await vin(page).fill("1HGCM82633A004353");
  await page.getByRole("button", { name: "Расшифровать VIN" }).click();
  await expect(field(page, "engine_volume_cc")).toHaveValue("0");
  await expect(field(page, "horse_power")).toHaveValue("");
  await expect(shareButton(page)).toHaveCount(0);
});

test("browser errors, EV missing power, date mismatch and disabled Drom are visible", async ({ page }) => {
  await myauto(page).fill("invalid");
  await page.getByRole("button", { name: "Загрузить авто" }).click();
  await expect(page.getByText("Не удалось загрузить авто. Проверьте ссылку или ID объявления.", { exact: true })).toBeVisible();
  await load(page, "1003");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  await expect(page.getByText("Обязательное поле", { exact: true })).toBeVisible();
  await field(page, "electric_power_kw").fill("153");
  await field(page, "manufacture_date").fill(`01/${new Date().getFullYear() - 1}`);
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  await expect(page.getByText("Год месяца производства должен совпадать с годом выпуска", { exact: true })).toBeVisible();
  await field(page, "manufacture_date").fill("");
  await field(page, "auto_market_comparison").check();
  const result = await calculate(page);
  expect(result.market_comparison?.status).toBe("NOT_CONFIGURED");
  await expect(page.getByText(/разрешённый API-доступ ещё не подтверждён/)).toBeVisible();
});

test("failed recalculation removes the previous result and can recover", async ({ page }) => {
  await load(page, "1001");
  await calculate(page);
  await page.route("**/calculator/total", (route) => route.fulfill({ status: 503, json: { detail: "unavailable" } }));
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  await expect(page.getByText("Сервис временно недоступен. Попробуйте немного позже.", { exact: true })).toBeVisible();
  await expect(shareButton(page)).toHaveCount(0);
  await page.unroute("**/calculator/total");
  await calculate(page);
  const request = (await share(page)).payload.request as CalculatorRequest;
  expect(request.source_make).toBe("BMW");
  await page.getByRole("button", { name: "Сбросить расчёт" }).click();
  await field(page, "car_price_usd").fill("30000");
  await field(page, "engine_volume_cc").fill("1998");
  await field(page, "car_year").fill(String(new Date().getFullYear() - 2));
  await field(page, "horse_power").fill("150");
  await calculate(page);
  const href = await page.getByRole("link", { name: "Заказать через MileON", exact: true }).getAttribute("href");
  expect(new URL(href!).searchParams.get("text")).toContain("Хочу заказать через MileON: автомобиль из расчёта.");
});

test("numeric manufacture month survives calculation and a fresh public deal", async ({ page, context }, info) => {
  await load(page, "1001");
  const year = await field(page, "car_year").inputValue();
  await field(page, "manufacture_date").fill(`05/${year}`);
  const result = await calculate(page);
  expect(result.manufacture_date_used).toBe(`${year}-05-01`);
  expect(result.age_is_estimated).toBe(false);
  await expect(page.getByText(`Месяц производства в расчёте: 05/${year}`, { exact: true })).toBeVisible();
  const { created, payload } = await share(page);
  expect(payload.request.manufacture_date).toBe(`${year}-05-01`);
  const fresh = await context.browser()!.newContext();
  const publicPage = await fresh.newPage();
  await publicPage.goto(`${new URL(page.url()).origin}/ru/deal/${created.public_id}`);
  await expect(publicPage.getByText(`Месяц производства в расчёте: 05/${year}`, { exact: true })).toBeVisible();
  await info.attach("numeric-manufacture-date-result", { body: await screenshot(publicPage), contentType: "image/png" });
  await fresh.close();
});

test("numeric manufacture month rejects invalid format and a future month before API submission", async ({ page }) => {
  await load(page, "1001");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/calculator/total")) requests.push(request.url());
  });
  const year = await field(page, "car_year").inputValue();
  for (const invalid of [`00/${year}`, `13/${year}`, `5/${year}`, "05/20"]) {
    await field(page, "manufacture_date").fill(invalid);
    await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
    await expect(page.getByText("Укажите месяц и год в формате ММ/ГГГГ", { exact: true })).toBeVisible();
  }
  if (new Date().getMonth() < 11) {
    await field(page, "car_year").fill(String(new Date().getFullYear()));
    await field(page, "manufacture_date").fill(`12/${new Date().getFullYear()}`);
    await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
    await expect(page.getByText("Месяц производства не может быть в будущем", { exact: true })).toBeVisible();
  }
  expect(requests).toEqual([]);
});
