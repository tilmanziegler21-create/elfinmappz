import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.use({ video: "on" });

test.afterEach(async ({ page }) => {
  const video = page.video();
  await page.close();
  if (video) await video.saveAs("artifacts/telegram-webview/nav-clicks.webm");
});

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

async function installSheet(page: Page) {
  await page.addInitScript(() => {
    const handlers: Array<{ event: string; cb: (payload?: { isStateStable?: boolean }) => void }> = [];
    const web = {
      version: "8.0",
      initData: "",
      isExpanded: false,
      viewportHeight: 520,
      viewportStableHeight: 520,
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 47, bottom: 34, left: 0, right: 0 },
      ready() {},
      expand() { this.isExpanded = true; },
      onEvent(event: string, cb: (payload?: { isStateStable?: boolean }) => void) { handlers.push({ event, cb }); },
      offEvent(event: string, cb: (payload?: { isStateStable?: boolean }) => void) {
        const index = handlers.findIndex((item) => item.event === event && item.cb === cb);
        if (index >= 0) handlers.splice(index, 1);
      },
      emit(event: string, payload?: { isStateStable?: boolean }) {
        for (const item of handlers) if (item.event === event) item.cb(payload);
      },
    };
    (window as unknown as { Telegram: { WebApp: typeof web } }).Telegram = { WebApp: web };
    sessionStorage.setItem("elfin-age", "ok");
  });
}

async function showSheet(page: Page, width: number, stable: number, windowHeight = 900) {
  await page.setViewportSize({ width, height: windowHeight });
  await page.evaluate((height) => {
    const web = (window as unknown as { Telegram: { WebApp: {
      viewportHeight: number;
      viewportStableHeight: number;
      emit: (event: string, payload?: { isStateStable?: boolean }) => void;
    } } }).Telegram.WebApp;
    web.viewportHeight = height;
    web.viewportStableHeight = height;
    web.emit("viewportChanged", { isStateStable: true });
  }, stable);
}

async function navInsideSheet(page: Page, stable: number) {
  return page.evaluate((height) => {
    const root = document.getElementById("root");
    const nav = document.querySelector(".nav");
    if (!(root instanceof HTMLElement) || !(nav instanceof HTMLElement)) return { ok: false, reason: "missing" };
    const rootBox = root.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll(".nav-btn")];
    const hits = buttons.map((node) => {
      const rect = node.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        name: node.textContent?.trim() || "",
        hit: target instanceof Element && node.contains(target),
        bottom: rect.bottom,
      };
    });
    const wide = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    return {
      ok: rootBox.height <= height + 1
        && rootBox.top >= -1
        && rootBox.bottom <= height + 1
        && navBox.bottom <= rootBox.bottom + 1
        && navBox.top >= rootBox.top
        && navBox.bottom < height - 20
        && hits.every((item) => item.hit)
        && !wide,
      root: rootBox.height,
      navBottom: navBox.bottom,
      hits,
    };
  }, stable);
}

test("корзина нажимается в коротком окне Telegram", async ({ page }) => {
  test.setTimeout(90_000);
  mkdirSync("artifacts/telegram-webview", { recursive: true });
  await installSheet(page);
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await showSheet(page, 390, 520, 900);
  const placed = await navInsideSheet(page, 520);
  expect(placed.ok, JSON.stringify(placed)).toBe(true);
  await page.screenshot({ path: "artifacts/telegram-webview/home-short.png" });

  const nav = page.getByRole("navigation", { name: "Разделы" });
  await nav.getByRole("button", { name: "Корзина" }).click();
  await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/telegram-webview/cart-short.png" });
  expect((await navInsideSheet(page, 520)).ok).toBe(true);

  await nav.getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await expect(page.getByText("Нет фото этого вкуса")).toHaveCount(0);
  await expect(page.locator(".hero-scene img")).toHaveCount(1);
  await page.getByRole("button", { name: "Выбрать объём" }).click();
  const sheet = page.getByRole("dialog", { name: "Объём" });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => {
    const sheetBox = await sheet.boundingBox();
    const sheetRoot = await page.locator("#root").boundingBox();
    return Boolean(sheetBox && sheetRoot && sheetBox.y >= sheetRoot.y - 1 && sheetBox.y + sheetBox.height <= sheetRoot.y + sheetRoot.height + 1);
  }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await page.getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: /^Корзина/ }).click();
  await expect(page.getByRole("heading", { name: "Корзина", exact: true })).toBeVisible();

  await nav.getByRole("button", { name: "Каталог" }).click();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toBeVisible();
  await nav.getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("dialog", { name: "Оформление заказа" })).toBeVisible();
  const confirm = await page.getByRole("button", { name: "Подтвердить заказ" }).boundingBox();
  const root = await page.locator("#root").boundingBox();
  expect(confirm && root && confirm.y + confirm.height).toBeLessThanOrEqual(root.y + root.height + 1);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".sheet-layer.is-open")).toHaveCount(0);
  expect((await navInsideSheet(page, 520)).ok).toBe(true);

  for (let i = 0; i < 10; i += 1) {
    for (const name of ["Главная", "Каталог", "Заказы", "Профиль", "Корзина"]) {
      await nav.getByRole("button", { name }).click();
    }
    expect((await navInsideSheet(page, 520)).ok).toBe(true);
  }

  const widths = [320, 360, 375, 390, 393, 414, 430];
  const heights = [500, 568, 600, 667, 700, 780, 844, 932];
  for (const width of widths) {
    for (const height of heights) {
      await showSheet(page, width, height, Math.max(height, 900));
      const state = await navInsideSheet(page, height);
      expect(state.ok, `${width}x${height} ${JSON.stringify(state)}`).toBe(true);
    }
  }

  await page.setViewportSize({ width: 700, height: 900 });
  await showSheet(page, 700, 360, 900);
  expect((await navInsideSheet(page, 360)).ok).toBe(true);

  await showSheet(page, 390, 520, 900);
  await nav.getByRole("button", { name: "Каталог" }).click();
  await page.evaluate(() => {
    const web = (window as unknown as { Telegram: { WebApp: {
      viewportHeight: number;
      viewportStableHeight: number;
      emit: (event: string, payload?: { isStateStable?: boolean }) => void;
    } } }).Telegram.WebApp;
    web.viewportStableHeight = 520;
    web.viewportHeight = 320;
    web.emit("viewportChanged", { isStateStable: true });
  });
  const search = page.getByRole("textbox", { name: "Поиск" });
  await search.click();
  const searchBox = await search.boundingBox();
  const openRoot = await page.locator("#root").boundingBox();
  expect(openRoot && openRoot.height).toBeLessThanOrEqual(321);
  expect(searchBox && openRoot && searchBox.y + searchBox.height).toBeLessThanOrEqual(openRoot.y + openRoot.height + 1);
  await page.screenshot({ path: "artifacts/telegram-webview/keyboard.png" });
});
