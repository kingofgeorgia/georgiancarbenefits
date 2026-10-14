import { expect, test, type Locator } from "@playwright/test";

async function expectLinkTextFits(link: Locator) {
  const layout = await link.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const text = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
      .map((node) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { top: rect.top - box.top, bottom: rect.bottom - box.top, left: rect.left - box.left, right: rect.right - box.left };
      });
    return { width: box.width, height: box.height, text };
  });
  expect(layout.text.length).toBeGreaterThan(0);
  for (const rect of layout.text) {
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.bottom).toBeLessThanOrEqual(layout.height + 1);
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(layout.width + 1);
  }
}

const locales = [
  { locale: "ru", calculate: "Рассчитать", share: "Поделиться расчётом", total: "Итого к оплате", order: "Заказать этот автомобиль через MileON" },
  { locale: "en", calculate: "Calculate", share: "Share calculation", total: "Total cost", order: "Order this car with MileON" },
  { locale: "ka", calculate: "გამოთვლა", share: "გამოთვლის გაზიარება", total: "სულ", order: "ამ ავტომობილის შეკვეთა MileON-ით" },
] as const;

for (const copy of locales) {
  test(`${copy.locale} shared link survives clipboard and popup blocking`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("popup", (popup) => popup.on("pageerror", (error) => errors.push(error.message)));
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => { throw new DOMException("Clipboard denied", "NotAllowedError"); } },
      });
      window.open = () => null;
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/${copy.locale}`);
    for (const [name, value] of Object.entries({
      car_price_usd: "30000", engine_volume_cc: "1998", horse_power: "150",
      car_year: String(new Date().getFullYear() - 2),
    })) {
      await page.locator(`[name="${name}"]`).fill(value);
    }
    const calculation = page.waitForResponse((response) => response.url().endsWith("/calculator/total") && response.request().method() === "POST");
    await page.getByRole("button", { name: copy.calculate, exact: true }).click();
    expect((await calculation).status()).toBe(200);
    const created = page.waitForResponse((response) => response.url().endsWith("/deals/") && response.request().method() === "POST");
    await page.getByRole("button", { name: copy.share, exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const { public_id: publicId } = await response.json();
    const origin = new URL(page.url()).origin;
    const url = `${origin}/${copy.locale}/deal/${publicId}`;
    const link = page.getByRole("link", { name: url, exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", url);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 10000 });
    await expect(link).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expectLinkTextFits(page.locator('a[href^="https://wa.me/"]'));
    if (copy.locale === "ru") {
      await testInfo.attach("share-link-clipboard-fallback", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
    const opened = page.waitForEvent("popup");
    await link.click();
    const publicPage = await opened;
    await expect(publicPage).toHaveURL(url);
    await expect(publicPage.getByText(copy.total, { exact: true })).toBeVisible();
    await expectLinkTextFits(publicPage.getByRole("link", { name: copy.order, exact: true }));
    const href = await publicPage.getByRole("link", { name: copy.order, exact: true }).getAttribute("href");
    expect(new URL(href!).searchParams.get("text")).toContain(url);
    const next = locales.find((candidate) => candidate.locale === (copy.locale === "en" ? "ru" : "en"))!;
    await publicPage.getByRole("button", { name: new RegExp(`^${next.locale}$`, "i") }).click();
    const switched = `${origin}/${next.locale}/deal/${publicId}`;
    await expect(publicPage).toHaveURL(switched);
    await expect(publicPage.getByText(next.total, { exact: true })).toBeVisible();
    const switchedHref = await publicPage.getByRole("link", { name: next.order, exact: true }).getAttribute("href");
    expect(new URL(switchedHref!).searchParams.get("text")).toContain(switched);
    expect(errors).toEqual([]);
    await publicPage.close();
  });
}
