import { expect, test } from "@playwright/test";

const copies = [
  { locale: "ru", calculate: "Рассчитать", share: "Поделиться расчётом", rate: "Слишком много запросов. Подождите немного и попробуйте снова.", size: "Слишком большой объём данных. Сократите заметку и попробуйте снова." },
  { locale: "en", calculate: "Calculate", share: "Share calculation", rate: "Too many requests. Please wait a little and try again.", size: "Too much data. Shorten your note and try again." },
  { locale: "ka", calculate: "გამოთვლა", share: "გამოთვლის გაზიარება", rate: "ძალიან ბევრი მოთხოვნაა. ცოტა ხანს დაელოდეთ და სცადეთ ხელახლა.", size: "მონაცემების მოცულობა ძალიან დიდია. შეამცირეთ შენიშვნა და სცადეთ ხელახლა." },
] as const;

for (const copy of copies) {
  test(`${copy.locale} protection errors are readable and calculation can recover`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${copy.locale}`);
    for (const [name, value] of Object.entries({
      car_price_usd: "30000", engine_volume_cc: "1998", horse_power: "150",
      car_year: String(new Date().getFullYear() - 2),
    })) {
      await page.locator(`[name="${name}"]`).fill(value);
    }
    await page.route("**/calculator/total", (route) => route.fulfill({
      status: 429, contentType: "application/json", headers: { "Retry-After": "60", "Access-Control-Allow-Origin": new URL(page.url()).origin }, body: JSON.stringify({ detail: "Too many requests" }),
    }));
    await page.getByRole("button", { name: copy.calculate, exact: true }).click();
    await expect(page.getByText(copy.rate, { exact: true })).toBeVisible();
    const notification = page.locator("[data-sonner-toast]").filter({ hasText: copy.rate });
    await expect(notification).toHaveCSS("opacity", "1");
    const bounds = await notification.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(741);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (copy.locale === "ru") {
      await testInfo.attach("mobile-rate-limit-error", { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
    }
    await page.unroute("**/calculator/total");
    const calculated = page.waitForResponse((response) => response.url().endsWith("/calculator/total") && response.request().method() === "POST");
    await page.getByRole("button", { name: copy.calculate, exact: true }).click();
    expect((await calculated).status()).toBe(200);
    await expect(page.getByRole("button", { name: copy.share, exact: true })).toBeVisible();
    await page.route("**/deals/", (route) => route.fulfill({ status: 413, contentType: "application/json", headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin }, body: JSON.stringify({ detail: "Request body is too large" }) }));
    await page.getByRole("button", { name: copy.share, exact: true }).click();
    await expect(page.getByText(copy.size, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.share, exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  });
}

test("image optimizer rejects private and lookalike destinations", async ({ request }) => {
  for (const url of ["http://127.0.0.1:8000/health", "http://169.254.169.254/latest/meta-data/", "https://static.my.ge.evil.example/myauto/photos/x.jpg", "https://other.myauto.ge/x.jpg"]) {
    const response = await request.get("/_next/image", { params: { url, w: "640", q: "75" } });
    expect(response.status()).toBe(400);
  }
});
