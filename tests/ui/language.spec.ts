import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://telegram.org/js/telegram-web-app.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "",
  }));
});

async function ready(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("elfin-age", "ok"));
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
}

test("без кода Telegram интерфейс русский", async ({ page }) => {
  await ready(page);
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
});

test("региональный код и неизвестный код выбирают язык интерфейса", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("elfin-age", "ok");
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: { initDataUnsafe: { user: { language_code: "uk-UA" } } },
    };
  });
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByText("Усе в одному місці")).toBeVisible();

  await page.addInitScript(() => {
    sessionStorage.setItem("elfin-age", "ok");
    localStorage.setItem("elfin-lang", "de");
    localStorage.setItem("elfin-lang-manual", "1");
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: { initDataUnsafe: { user: { language_code: "uk-UA" } } },
    };
  });
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByText("Alles an einem Ort")).toBeVisible();
});

test("неизвестный код открывает английский", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("elfin-age", "ok");
    (window as unknown as { Telegram: unknown }).Telegram = {
      WebApp: { initDataUnsafe: { user: { language_code: "fr" } } },
    };
  });
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByText("Everything in one place")).toBeVisible();
});

test("смена языка не сбрасывает раздел и не перезагружает магазин", async ({ page }) => {
  await ready(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: /Язык \/ Language/ }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Language")).toBeVisible();
  await expect(page.locator(".splash")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Catalog" }).click();
  await expect(page.getByRole("tab", { name: "Liquids" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Search" })).toBeVisible();
});

for (const width of [320, 360, 390, 430]) {
  test(`немецкая навигация помещается на ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.addInitScript(() => {
      sessionStorage.setItem("elfin-age", "ok");
      localStorage.setItem("elfin-lang", "de");
      localStorage.setItem("elfin-lang-manual", "1");
    });
    await page.goto("/");
    await expect(page.locator(".splash")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "Bereiche" });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(width);
    expect(box?.y ?? 0).toBeLessThan(700);
    await expect(nav.getByRole("button", { name: "Warenkorb" })).toBeVisible();
  });
}
