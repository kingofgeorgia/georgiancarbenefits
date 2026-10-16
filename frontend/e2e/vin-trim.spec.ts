import { expect, test, type Page } from "@playwright/test";

async function decode(page: Page, vin: string, button = "Расшифровать VIN") {
  await page.locator('input[maxlength="17"]').fill(vin);
  const response = page.waitForResponse((result) => result.url().endsWith("/cars/from-vin") && result.request().method() === "POST");
  await page.getByRole("button", { name: button, exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByTestId("vin-result")).toBeVisible();
}

test("VIN trim and additional trim are labelled separately from series and clear on the next vehicle", async ({ page }) => {
  await page.goto("/ru");
  await decode(page, "1HGCM82633A004352");
  await expect(page.getByTestId("vin-trim-value")).toHaveText("EX / V6");
  await expect(page.getByTestId("vin-trim")).toContainText("Источник комплектации: NHTSA vPIC");
  await expect(page.getByText("Серия: CM8", { exact: true })).toBeVisible();
  await decode(page, "1HGCM82633A004353");
  await expect(page.getByTestId("vin-result")).toContainText("HONDA Accord 2003");
  await expect(page.getByTestId("vin-trim")).toHaveCount(0);
  await expect(page.getByText("Не определена по VIN", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Бесплатный источник не указал комплектацию/)).toHaveCount(0);
  await expect(page.getByText("EX / V6", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Серия: CM8", { exact: true })).toHaveCount(0);
  await decode(page, "1HGCM82633A004352");
  await expect(page.getByTestId("vin-trim-value")).toHaveText("EX / V6");
});

test("VIN pattern trim is marked as such and never supplies regulatory EV power", async ({ page }) => {
  await page.goto("/ru");
  await decode(page, "7SAYGDEF4PF665873");
  await expect(page.getByTestId("vin-trim-value")).toHaveText("Performance AWD");
  await expect(page.getByTestId("vin-trim")).toContainText("Обозначение VIN");
  await expect(page.locator('[name="electric_power_kw"]')).toHaveValue("");
});

test("failed VIN lookup does not leave the previous trim visible and can recover", async ({ page }) => {
  await page.goto("/ru");
  await decode(page, "1HGCM82633A004352");
  await page.route("**/cars/from-vin", (route) => route.fulfill({ status: 503, json: { detail: "Unavailable" } }));
  await page.locator('input[maxlength="17"]').fill("1HGCM82633A004353");
  await page.getByRole("button", { name: "Расшифровать VIN", exact: true }).click();
  await expect(page.getByText("Сервис временно недоступен. Попробуйте немного позже.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("vin-trim")).toHaveCount(0);
  await page.unroute("**/cars/from-vin");
  await decode(page, "1HGCM82633A004352");
  await expect(page.getByTestId("vin-trim-value")).toHaveText("EX / V6");
});

for (const [locale, button, placeholder, removedHint] of [
  ["ru", "Расшифровать VIN", "ММ/ГГГГ", "День указывать не нужно. Для расчёта используется первое число выбранного месяца."],
  ["en", "Decode VIN", "MM/YYYY", "No day is required. The first day of the selected month is used for the age calculation."],
  ["ka", "VIN-ის დეკოდირება", "თთ/წწწწ", "დღის მითითება საჭირო არ არის. ასაკის გამოსათვლელად არჩეული თვის პირველი დღე გამოიყენება."],
]) {
  test(`${locale} VIN trim and numeric month fit mobile`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${locale}`);
    await decode(page, "1HGCM82633A004352", button);
    await expect(page.getByTestId("vin-trim-value")).toHaveText("EX / V6");
    const month = page.getByPlaceholder(placeholder, { exact: true });
    await expect(month).toHaveAttribute("type", "text");
    await expect(page.locator('input[type="month"]')).toHaveCount(0);
    await expect(page.getByText(removedHint, { exact: true })).toHaveCount(0);
    await expect(page.locator("#spec-make")).toHaveCount(0);
    await month.fill("05/2003");
    await expect(month).toHaveValue("05/2003");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await info.attach(`vin-trim-${locale}-mobile`, { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
  });

  test(`${locale} missing VIN trim has no empty section or explanatory text`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${locale}`);
    await decode(page, "1HGCM82633A004353", button);
    await expect(page.getByTestId("vin-result")).toContainText("HONDA Accord 2003");
    await expect(page.getByTestId("vin-trim")).toHaveCount(0);
    await expect(page.getByTestId("vin-trim-value")).toHaveCount(0);
    await expect(page.getByText(/Бесплатный источник не указал комплектацию|The free source did not report a trim|უფასო წყარომ კომპლექტაცია არ მიუთითა/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await info.attach(`vin-no-trim-${locale}-mobile`, { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
  });
}
