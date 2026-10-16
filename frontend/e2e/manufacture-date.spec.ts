import { expect, test, type Page } from "@playwright/test";

const dateInput = (page: Page) => page.locator('[name="manufacture_date"]');
const picker = (page: Page) => page.getByRole("dialog", { name: "Выбрать месяц и год", exact: true });
const trigger = (page: Page) => page.getByRole("button", { name: "Выбрать месяц и год", exact: true });

test("production date accepts only digits and keeps the slash while typing, replacing and deleting", async ({ page }) => {
  await page.goto("/ru");
  const field = page.getByLabel("Дата производства", { exact: true });
  await expect(field).toHaveAttribute("inputmode", "numeric");
  await expect(field).toHaveValue("ММ/ГГГГ");
  await field.pressSequentially("05");
  await expect(field).toHaveValue("05/ГГГГ");
  await field.pressSequentially("2021");
  await expect(field).toHaveValue("05/2021");
  await field.press("Home");
  await field.press("Shift+ArrowRight");
  await field.press("Shift+ArrowRight");
  await field.pressSequentially("1");
  await expect(field).toHaveValue("1М/2021");
  await field.pressSequentially("2");
  await expect(field).toHaveValue("12/2021");
  await field.press("Home");
  await field.press("ArrowRight");
  await field.press("ArrowRight");
  await field.press("ArrowRight");
  await field.press("Backspace");
  await expect(field).toHaveValue(/\//);
  await field.press("ControlOrMeta+A");
  await field.press("Backspace");
  await expect(field).toHaveValue("ММ/ГГГГ");
  await field.fill("052021");
  await expect(field).toHaveValue("05/2021");
  await field.fill("05-2021");
  await expect(field).toHaveValue("05/2021");
});

test("calendar selection uses the vehicle year, closes without submitting and reaches the calculation unchanged", async ({ page }) => {
  await page.goto("/ru");
  for (const [name, value] of Object.entries({ car_price_usd: "30000", engine_volume_cc: "1998", car_year: "2021", horse_power: "150" })) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  const calls: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/calculator/total")) calls.push(request.url()); });
  await trigger(page).click();
  await expect(picker(page).getByRole("combobox", { name: "Год", exact: true })).toHaveValue("2021");
  await picker(page).getByRole("button", { name: "май 2021", exact: true }).click();
  await expect(picker(page)).toHaveCount(0);
  await expect(dateInput(page)).toHaveValue("05/2021");
  await expect(dateInput(page)).toBeFocused();
  expect(calls).toEqual([]);
  const response = page.waitForResponse((result) => result.url().endsWith("/calculator/total") && result.request().method() === "POST");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().manufacture_date).toBe("2021-05-01");
  expect((await result.json()).manufacture_date_used).toBe("2021-05-01");
});

test("calendar supports keyboard opening, Escape, year bounds, future-month protection and clearing", async ({ page }) => {
  await page.goto("/ru");
  await dateInput(page).fill("052021");
  await dateInput(page).press("Alt+ArrowDown");
  await expect(picker(page)).toBeVisible();
  const year = picker(page).getByRole("combobox", { name: "Год", exact: true });
  await expect(year).toHaveValue("2021");
  await expect(picker(page).getByRole("button", { name: "май 2021", exact: true })).toHaveAttribute("aria-pressed", "true");
  await picker(page).getByRole("button", { name: "Предыдущий год", exact: true }).click();
  await expect(year).toHaveValue("2020");
  await picker(page).getByRole("button", { name: "Следующий год", exact: true }).click();
  await expect(year).toHaveValue("2021");
  await year.selectOption("1990");
  await expect(picker(page).getByRole("button", { name: "Предыдущий год", exact: true })).toBeDisabled();
  await year.selectOption(String(new Date().getFullYear()));
  await expect(picker(page).getByRole("button", { name: "Следующий год", exact: true })).toBeDisabled();
  if (new Date().getMonth() < 11) {
    await expect(picker(page).getByRole("button", { name: `декабрь ${new Date().getFullYear()}`, exact: true })).toBeDisabled();
  }
  await year.press("Escape");
  await expect(picker(page)).toHaveCount(0);
  await expect(dateInput(page)).toBeFocused();
  await expect(dateInput(page)).toHaveValue("05/2021");
  await trigger(page).click();
  await expect(picker(page).getByRole("combobox", { name: "Год", exact: true })).toHaveValue("2021");
  await picker(page).getByRole("button", { name: "Очистить дату", exact: true }).click();
  await expect(dateInput(page)).toHaveValue("ММ/ГГГГ");
  await expect(picker(page)).toHaveCount(0);
  await dateInput(page).fill("052021");
  await page.getByRole("button", { name: "Сбросить расчёт", exact: true }).click();
  await expect(dateInput(page)).toHaveValue("ММ/ГГГГ");
});

test("cleared mask stays optional and does not submit placeholder characters", async ({ page }) => {
  await page.goto("/ru");
  for (const [name, value] of Object.entries({ car_price_usd: "30000", engine_volume_cc: "1998", car_year: "2021", horse_power: "150" })) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  await dateInput(page).fill("052021");
  await trigger(page).click();
  await picker(page).getByRole("button", { name: "Очистить дату", exact: true }).click();
  const response = page.waitForResponse((result) => result.url().endsWith("/calculator/total") && result.request().method() === "POST");
  await page.getByRole("button", { name: "Рассчитать", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().manufacture_date).toBeNull();
  expect((await result.json()).age_is_estimated).toBe(true);
});

for (const copy of [
  { locale: "ru", label: "Дата производства", calendar: "Выбрать месяц и год", year: "Год", january: "январь" },
  { locale: "en", label: "Production date", calendar: "Choose month and year", year: "Year", january: "January" },
  { locale: "ka", label: "წარმოების თარიღი", calendar: "თვისა და წლის არჩევა", year: "წელი", january: "იანვარი" },
]) {
  test(`${copy.locale} production-date calendar fits mobile and accepts numeric input`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${copy.locale}`);
    const field = page.getByLabel(copy.label, { exact: true });
    await expect(field).toHaveValue(/^\D{2}\/\D{4}$/);
    await field.pressSequentially("052021");
    await expect(field).toHaveValue("05/2021");
    const button = page.getByRole("button", { name: copy.calendar, exact: true });
    await expect(button).toHaveAttribute("title", copy.calendar);
    await button.click();
    const dialog = page.getByRole("dialog", { name: copy.calendar, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: copy.year, exact: true })).toHaveValue("2021");
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(740);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await info.attach(`manufacture-calendar-${copy.locale}-mobile`, { body: await page.screenshot({ fullPage: true, animations: "disabled" }), contentType: "image/png" });
    const month = `${copy.january} 2021`;
    await dialog.getByRole("button", { name: month, exact: true }).click();
    await expect(field).toHaveValue("01/2021");
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
