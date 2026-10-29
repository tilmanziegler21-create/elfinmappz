import { expect, test, type Page } from "@playwright/test";
import { signInitData } from "../telegram-sign.mjs";

const bot = "elfin-qa-ui-bot";

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

async function openShop(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("elfin-age", "ok"));
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
}

async function installTelegram(page: Page, initData: string) {
  await page.addInitScript((value) => {
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: {
        initData: value,
        ready() {},
        expand() {},
        viewportHeight: 700,
        viewportStableHeight: 680,
        safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
        contentSafeAreaInset: { top: 0, bottom: 20, left: 0, right: 0 },
        onEvent() {},
        offEvent() {},
      },
    };
  }, initData);
}

test("проверенный Telegram заполняет оформление и переживает переходы", async ({ page }) => {
  const id = "9007199254740993";
  const now = Math.floor(Date.now() / 1000);
  await installTelegram(page, signInitData(`{"id":${id},"first_name":"Лея","last_name":"Норд","username":"leya"}`, now, bot));
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText(id)).toBeVisible();
  await expect(page.getByText("@leya")).toBeVisible();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByText("Telegram ID")).toBeVisible();
  await expect(page.getByText(id)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Имя" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Адрес" })).toHaveCount(0);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.getByRole("button", { name: "Заказы" }).click();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByText(id)).toBeVisible();
  await page.reload();
  await expect(page.locator(".splash")).toHaveCount(0);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText(id)).toBeVisible();
});

test("без username показывается честная подпись", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  await installTelegram(page, signInitData({ id: 424242, first_name: "Без ника" }, now, bot));
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Username не установлен")).toBeVisible();
  await expect(page.getByText("424242")).toBeVisible();
});

test("подпись с чужим hash не создаёт покупателя", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  const broken = signInitData({ id: 66, first_name: "Чужой" }, now, "wrong-bot-token");
  await installTelegram(page, broken);
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Не удалось подтвердить вход через Telegram. Откройте приложение заново.")).toBeVisible();
  await expect(page.getByText("66", { exact: true })).toHaveCount(0);
});

test("битая и просроченная подпись не создают покупателя", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  const expired = signInitData({ id: 77, first_name: "Старый" }, now - 3 * 24 * 60 * 60, bot);
  await installTelegram(page, expired);
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Не удалось подтвердить вход через Telegram. Откройте приложение заново.")).toBeVisible();
  await expect(page.getByText("77", { exact: true })).toHaveCount(0);
});

test("обрыв входа не подставляет чужой id", async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  await installTelegram(page, signInitData({ id: 88, first_name: "Сеть" }, now, bot));
  await page.route("**/api/auth/telegram", (route) => route.abort());
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Не удалось подтвердить вход через Telegram. Откройте приложение заново.")).toBeVisible();
  await expect(page.getByText("88", { exact: true })).toHaveCount(0);
});

test("кнопка бота берётся только из настроенного имени", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("elfin-age", "ok"));
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.devAuth = false;
    json.botUsername = "elfin_market_bot";
    await route.fulfill({ response, json });
  });
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("link", { name: "Открыть через Telegram" })).toHaveAttribute("href", "https://t.me/elfin_market_bot");
  await expect(page.getByRole("button", { name: "Наличные" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Карта при получении" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Другое" })).toBeDisabled();
});
