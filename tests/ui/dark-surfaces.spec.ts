import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const shots = "artifacts/dark-fix";

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

function paint(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      image: style.backgroundImage,
      color: style.color,
    };
  });
}

function channel(color: string) {
  const match = color.match(/[\d.]+/g);
  if (!match) return null;
  const [r, g, b, a] = match.map(Number);
  return { r, g, b, a: a ?? 1 };
}

function luminance(color: string) {
  const rgb = channel(color);
  if (!rgb || rgb.a === 0) return null;
  return (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
}

async function openShop(page: Page, cart: Record<string, number>) {
  await page.addInitScript((value) => {
    sessionStorage.setItem("elfin-age", "ok");
    sessionStorage.setItem("elfin-boot", "1");
    localStorage.setItem("elfin-cart", JSON.stringify(value));
  }, cart);
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
}

test("каталог не держит светлую подложку", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  await openShop(page, {});
  await page.screenshot({ path: `${shots}/home-fixed.png` });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Каталог" }).click();
  const tools = await paint(page, ".catalog-tools");
  expect(tools.image).not.toContain("247, 251, 254");
  expect(tools.image + tools.background).not.toContain("255, 255, 255");
  const word = await paint(page, ".catalog-word");
  expect(luminance(word.color) ?? 0).toBeGreaterThan(180);
  await page.screenshot({ path: `${shots}/catalog-fixed.png` });
  await page.getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await page.screenshot({ path: `${shots}/product-fixed.png` });
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Заказы" }).click();
  await page.screenshot({ path: `${shots}/orders-fixed.png` });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Профиль" }).click();
  await page.screenshot({ path: `${shots}/profile-fixed.png` });
});

test("итог корзины тёмный, а кнопки количества читаются", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  await openShop(page, { "elfliq-watermelon:30": 2, "north:10": 1, "frost:10": 1 });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  const bar = await paint(page, ".cart-bar");
  const amount = await paint(page, ".cart-bar .cart-amount");
  expect(luminance(bar.background) ?? 255).toBeLessThan(40);
  expect(luminance(amount.color) ?? 0).toBeGreaterThan(180);
  const plus = page.locator(".cart-item .qty button").nth(1);
  await expect(plus).toBeEnabled();
  const lastQty = await page.locator(".cart-item").last().locator(".qty").boundingBox();
  const barBox = await page.locator(".cart-bar").boundingBox();
  expect((lastQty?.y ?? 0) + (lastQty?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 1);
  const plusPaint = await plus.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  expect(luminance(plusPaint.background) ?? 255).toBeLessThan(40);
  expect(luminance(plusPaint.color) ?? 0).toBeGreaterThan(120);
  const name = page.locator(".cart-name").first();
  const clamp = await name.evaluate((node) => getComputedStyle(node).webkitLineClamp);
  expect(clamp).toBe("2");
  await page.screenshot({ path: `${shots}/cart-fixed.png` });
  await page.locator(".cart-name").first().evaluate((node) => {
    node.textContent = "80K 4 IN 1 — Blueberry Ice — Long flavor name";
  });
  const clamped = await page.locator(".cart-name").first().evaluate((node) => node.scrollHeight > node.clientHeight + 1 || getComputedStyle(node).webkitLineClamp === "2");
  expect(clamped).toBe(true);
  await page.screenshot({ path: `${shots}/cart-long-name.png` });
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("button", { name: "Подтвердить заказ" })).toBeVisible();
  await page.screenshot({ path: `${shots}/checkout-fixed.png` });
});

test("короткое окно оставляет итог и оформление над навигацией", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await openShop(page, {
    "elfliq-watermelon:30": 2,
    "north:10": 1,
    "north:30": 1,
    "clear:10": 1,
    "quiet:10": 1,
    "sapphire:10": 1,
    "sapphire:30": 1,
    "frost:10": 1,
  });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  const checkout = await page.getByRole("button", { name: "К оформлению" }).boundingBox();
  const nav = await page.getByRole("navigation", { name: "Разделы" }).boundingBox();
  expect(checkout).not.toBeNull();
  expect(nav).not.toBeNull();
  expect((checkout?.y ?? 0) + (checkout?.height ?? 0)).toBeLessThanOrEqual(nav?.y ?? 0);
  await page.getByRole("button", { name: "Больше" }).first().click();
  await expect(page.locator(".cart-item .qty span").first()).toHaveText("3");
});

const stocked = {
  "elfliq-watermelon:30": 1,
  "north:10": 1,
  "north:30": 1,
  "clear:10": 1,
  "quiet:10": 1,
  "sapphire:10": 1,
  "sapphire:30": 1,
  "frost:10": 1,
};

test("один товар не оставляет пустоту перед итогом", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  await openShop(page, { "elfliq-watermelon:30": 1 });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  const item = await page.locator(".cart-item").boundingBox();
  const bar = await page.locator(".cart-bar").boundingBox();
  const gap = (bar?.y ?? 0) - ((item?.y ?? 0) + (item?.height ?? 0));
  expect(gap).toBeGreaterThanOrEqual(-1);
  expect(gap).toBeLessThanOrEqual(24);
  const minus = page.locator(".cart-item .qty button").first();
  await expect(minus).toBeDisabled();
  const minusPaint = await minus.evaluate((node) => getComputedStyle(node).color);
  expect(luminance(minusPaint) ?? 0).toBeGreaterThan(80);
  await page.screenshot({ path: `${shots}/cart-one.png` });
});

test("длинный список прокручивается над итогом", async ({ page }) => {
  fs.mkdirSync(shots, { recursive: true });
  await openShop(page, stocked);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await expect(page.locator(".cart-item")).toHaveCount(8);
  await page.locator(".cart-list").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const lastQty = await page.locator(".cart-item").last().locator(".qty").boundingBox();
  const bar = await page.locator(".cart-bar").boundingBox();
  const nav = await page.getByRole("navigation", { name: "Разделы" }).boundingBox();
  expect((lastQty?.y ?? 0) + (lastQty?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1);
  expect((bar?.y ?? 0) + (bar?.height ?? 0)).toBeLessThanOrEqual(nav?.y ?? 0);
  await page.screenshot({ path: `${shots}/cart-many.png` });
});

test("корзина читается на узких и коротких окнах", async ({ page }) => {
  const sizes = [
    { width: 320, height: 500 },
    { width: 360, height: 600 },
    { width: 390, height: 700 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await openShop(page, { "elfliq-watermelon:30": 2, "north:10": 1, "frost:10": 1 });
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
    const bar = await paint(page, ".cart-bar");
    expect(luminance(bar.background) ?? 255).toBeLessThan(40);
    const checkout = await page.getByRole("button", { name: "К оформлению" }).boundingBox();
    const nav = await page.getByRole("navigation", { name: "Разделы" }).boundingBox();
    expect((checkout?.y ?? 0) + (checkout?.height ?? 0)).toBeLessThanOrEqual((nav?.y ?? 0) + 1);
    const overflow = await page.locator(".cart-page").evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    expect(overflow).toBe(false);
  }
});

test("тёмные поверхности на uk и de", async ({ page }) => {
  for (const [lang, cartName, catalogName] of [
    ["uk", "Кошик", "Каталог"],
    ["de", "Warenkorb", "Katalog"],
  ] as const) {
    await page.addInitScript((code) => {
      localStorage.setItem("elfin-lang", code);
      localStorage.setItem("elfin-lang-manual", "1");
    }, lang);
    await openShop(page, { "elfliq-watermelon:30": 1 });
    await page.getByRole("navigation").getByRole("button", { name: cartName }).click();
    const bar = await paint(page, ".cart-bar");
    const amount = await paint(page, ".cart-bar .cart-amount");
    expect(luminance(bar.background) ?? 255).toBeLessThan(40);
    expect(luminance(amount.color) ?? 0).toBeGreaterThan(180);
    await page.getByRole("navigation").getByRole("button", { name: catalogName }).click();
    const tools = await paint(page, ".catalog-tools");
    expect(tools.image + tools.background).not.toContain("255, 255, 255");
    expect(tools.image).not.toContain("247, 251, 254");
  }
});
