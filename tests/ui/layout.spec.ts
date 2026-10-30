import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "on" });

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

async function openShop(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("elfin-age", "ok");
    localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 }));
  });
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
}

async function navHits(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".nav");
    if (!(nav instanceof HTMLElement)) return false;
    const style = getComputedStyle(nav);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return [...nav.querySelectorAll(".nav-btn")].every((node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit instanceof Element && node.contains(hit);
    });
  });
}

test("оформление и нижний бар не съезжают", async ({ page }) => {
  test.setTimeout(60_000);
  await openShop(page);
  const nav = page.getByRole("navigation", { name: "Разделы" });
  await expect(nav).toBeVisible();
  expect(await navHits(page)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/screenshots/bottomnav-before.png" });

  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(nav).toBeHidden();
  await page.screenshot({ path: "artifacts/qa/screenshots/product-transition.png" });
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  expect(await navHits(page)).toBe(true);

  await nav.getByRole("button", { name: "Каталог" }).click();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toBeVisible();
  await page.getByRole("article").filter({ hasText: "ELFLIQ" }).getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await nav.getByRole("button", { name: "Корзина" }).click();
  await expect(page.getByRole("button", { name: "К оформлению" })).toBeVisible();

  await page.getByRole("button", { name: "К оформлению" }).click();
  const dialog = page.getByRole("dialog", { name: "Оформление заказа" });
  await expect(dialog).toBeVisible();
  await expect(nav).toBeHidden();
  const field = () => page.getByRole("combobox", { name: "Курьер" }).boundingBox();
  const slot = () => page.locator(".checkout-error").boundingBox();
  const beforeField = await field();
  const beforeSlot = await slot();
  await page.screenshot({ path: "artifacts/qa/screenshots/checkout-normal.png" });
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Выберите курьера.");
  const afterField = await field();
  const afterSlot = await slot();
  expect(Math.abs((beforeField?.y ?? 0) - (afterField?.y ?? 0))).toBeLessThan(2);
  expect(Math.abs((beforeSlot?.height ?? 0) - (afterSlot?.height ?? 0))).toBeLessThan(1);
  await expect(page.getByRole("button", { name: "Подтвердить заказ" })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/screenshots/checkout-error.png" });

  await page.evaluate(() => document.documentElement.style.setProperty("--app-height", "564px"));
  const button = await page.getByRole("button", { name: "Подтвердить заказ" }).boundingBox();
  expect(button).toBeTruthy();
  expect((button?.y ?? 9999) + (button?.height ?? 0)).toBeLessThanOrEqual(564);
  await page.screenshot({ path: "artifacts/qa/screenshots/checkout-keyboard.png" });
  await page.evaluate(() => document.documentElement.style.removeProperty("--app-height"));

  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".sheet-layer")).toBeHidden();
  expect(await navHits(page)).toBe(true);
  await page.screenshot({ path: "artifacts/qa/screenshots/bottomnav-after.png" });

  for (let i = 0; i < 10; i += 1) {
    await page.getByRole("button", { name: "К оформлению" }).click();
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.locator(".sheet-layer")).toBeHidden();
    expect(await navHits(page)).toBe(true);
  }

  await nav.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Роль")).toBeVisible();
  await nav.getByRole("button", { name: "Главная" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  expect(await navHits(page)).toBe(true);

  for (const size of [
    { width: 320, height: 700 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(size);
    await nav.getByRole("button", { name: "Корзина" }).click();
    await page.getByRole("button", { name: "К оформлению" }).click();
    await expect(page.getByRole("dialog", { name: "Оформление заказа" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Имя" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Адрес" })).toHaveCount(0);
    await expect(page.getByText("Telegram ID")).toBeVisible();
    await expect(nav).toBeHidden();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.locator(".sheet-layer")).toBeHidden();
    await expect(nav).toBeVisible();
    const overflow = await page.evaluate(() => {
      const stage = document.querySelector(".stage");
      const root = document.documentElement;
      const wide = (node: Element) => node.scrollWidth > node.clientWidth + 1;
      return wide(root) || (stage instanceof Element && wide(stage));
    });
    expect(overflow).toBe(false);
    expect(await navHits(page)).toBe(true);
  }
});
