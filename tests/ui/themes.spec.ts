import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const shots = "artifacts/themes";

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

function luminance(color: string) {
  const match = color.match(/[\d.]+/g);
  if (!match) return 0;
  const [r, g, b, a] = match.map(Number);
  if ((a ?? 1) === 0) return 0;
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
}

async function boot(page: Page, theme: "light" | "dark", lang: "ru" | "uk" | "en" | "de", cart: Record<string, number> = {}) {
  await page.addInitScript(({ theme, lang, cart }) => {
    sessionStorage.setItem("elfin-age", "ok");
    sessionStorage.setItem("elfin-boot", "1");
    localStorage.setItem("elfin-theme", theme);
    localStorage.setItem("elfin-theme-manual", "1");
    localStorage.setItem("elfin-lang", lang);
    localStorage.setItem("elfin-lang-manual", "1");
    localStorage.setItem("elfin-cart", JSON.stringify(cart));
  }, { theme, lang, cart });
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

test("шапка главной переключает тему и язык и не сбрасывает магазин", async ({ page }) => {
  await boot(page, "dark", "ru", { "elfliq-watermelon:30": 2 });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: "Светлая тема" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Язык, RU" }).click();
  await page.getByRole("option", { name: /English/ }).click();
  await expect(page.getByRole("button", { name: "Language, EN" })).toBeVisible();
  await expect(page.locator(".splash")).toHaveCount(0);
  const stored = await page.evaluate(() => ({
    cart: localStorage.getItem("elfin-cart"),
    theme: localStorage.getItem("elfin-theme"),
    lang: localStorage.getItem("elfin-lang"),
  }));
  expect(stored.cart).toContain("elfliq-watermelon:30");
  expect(stored.theme).toBe("light");
  expect(stored.lang).toBe("en");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Catalog" }).click();
  await expect(page.getByRole("tab", { name: "Liquids" })).toHaveAttribute("aria-selected", "true");
});

test("восемь сочетаний темы и языка держат контраст и шапку", async ({ page }) => {
  const themes = ["light", "dark"] as const;
  const langs = ["ru", "uk", "en", "de"] as const;
  const home = { ru: "Всё в одном месте", uk: "Усе в одному місці", en: "Everything in one place", de: "Alles an einem Ort" };
  for (const theme of themes) {
    for (const lang of langs) {
      await boot(page, theme, lang);
      await expect(page.getByText(home[lang])).toBeVisible();
      const bar = await page.locator(".home-bar").boundingBox();
      const word = await page.locator(".home-bar .catalog-word").boundingBox();
      const tools = await page.locator(".home-tools").boundingBox();
      expect(bar && word && tools).toBeTruthy();
      expect((word?.x ?? 0) + (word?.width ?? 0)).toBeLessThanOrEqual((tools?.x ?? 0) + 1);
      expect((tools?.x ?? 0) + (tools?.width ?? 0)).toBeLessThanOrEqual((bar?.x ?? 0) + (bar?.width ?? 0) + 1);
      const card = await page.locator(".home-card").first().evaluate((node) => getComputedStyle(node).backgroundColor);
      const name = await page.locator(".home-card .product-name").first().evaluate((node) => getComputedStyle(node).color);
      if (theme === "dark") {
        expect(luminance(card)).toBeLessThan(50);
        expect(luminance(name)).toBeGreaterThan(180);
      } else {
        expect(luminance(card)).toBeGreaterThan(180);
        expect(luminance(name)).toBeLessThan(80);
      }
      const overflow = await page.locator(".home").evaluate((node) => node.scrollWidth > node.clientWidth + 1);
      expect(overflow).toBe(false);
    }
  }
});

for (const width of [320, 360, 390, 430]) {
  test(`шапка темы помещается на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await boot(page, width < 390 ? "light" : "dark", width < 390 ? "de" : "ru");
    const bar = await page.locator(".home-bar").boundingBox();
    const tools = await page.locator(".home-tools").boundingBox();
    expect((tools?.x ?? 0) + (tools?.width ?? 0)).toBeLessThanOrEqual((bar?.x ?? 0) + (bar?.width ?? 0) + 1);
    await expect(page.locator(".theme-toggle")).toBeVisible();
    await expect(page.locator(".lang-toggle")).toBeVisible();
  });
}

test("короткое окно оставляет переключатели и корзину", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await boot(page, "dark", "ru", { "elfliq-watermelon:30": 1 });
  const theme = await page.locator(".theme-toggle").boundingBox();
  const nav = await page.getByRole("navigation", { name: "Разделы" }).boundingBox();
  const cart = await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).boundingBox();
  expect((theme?.y ?? 0)).toBeGreaterThanOrEqual(0);
  expect((cart?.y ?? 0) + (cart?.height ?? 0)).toBeLessThanOrEqual((nav?.y ?? 0) + (nav?.height ?? 0) + 1);
  expect((nav?.y ?? 0) + (nav?.height ?? 0)).toBeLessThanOrEqual(500);
});

test("скрины главной, каталога, корзины и оформления в двух темах", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  const cart = { "elfliq-watermelon:30": 2, "north:10": 1 };
  for (const theme of ["light", "dark"] as const) {
    await boot(page, theme, "ru", cart);
    await page.screenshot({ path: `${shots}/${theme}-home.png` });
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Каталог" }).click();
    await expect(page.locator("section.is-current .product-photo.is-in").first()).toBeVisible();
    await page.screenshot({ path: `${shots}/${theme}-catalog.png` });
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
    const bar = await page.locator(".cart-bar").evaluate((node) => getComputedStyle(node).backgroundColor);
    const amount = await page.locator(".cart-bar .cart-amount").first().evaluate((node) => getComputedStyle(node).color);
    if (theme === "dark") {
      expect(luminance(bar)).toBeLessThan(50);
      expect(luminance(amount)).toBeGreaterThan(180);
    } else {
      expect(luminance(bar)).toBeGreaterThan(180);
      expect(luminance(amount)).toBeLessThan(80);
    }
    await page.screenshot({ path: `${shots}/${theme}-cart.png` });
    await page.getByRole("button", { name: "К оформлению" }).click();
    await expect(page.getByRole("button", { name: "Подтвердить заказ" })).toBeVisible();
    await page.screenshot({ path: `${shots}/${theme}-checkout.png` });
  }
});
