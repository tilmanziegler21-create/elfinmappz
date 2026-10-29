import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
}

async function watchScreens(page: Page) {
  await page.evaluate(() => {
    const frames: string[] = [];
    let run = true;
    const sample = () => {
      const home = document.body.innerText.includes("Всё в одном месте");
      const catalog = Boolean(document.querySelector("[aria-label='Поиск']"));
      const product = Boolean(document.querySelector("[aria-label='Назад в каталог']"));
      frames.push(`${home ? "home" : ""}${catalog ? "catalog" : ""}${product ? "product" : ""}`);
      if (run) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    (window as unknown as { __stopNav?: () => string[] }).__stopNav = () => {
      run = false;
      return frames;
    };
  });
}

test("с главной товар открывается без каталога и возвращает на главную", async ({ page }) => {
  await openShop(page);
  await watchScreens(page);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((node) => node.textContent?.includes("ELFLIQ"));
    button?.click();
    button?.click();
  });
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await expect(page).toHaveURL(/#product\/elfliq-watermelon/);
  const frames = await page.evaluate(() => (window as unknown as { __stopNav?: () => string[] }).__stopNav?.() ?? []);
  expect(frames.some((frame) => frame.includes("catalog"))).toBe(false);
  expect(frames.some((frame) => frame.includes("product"))).toBe(true);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await expect(page).not.toHaveURL(/#product\//);
});

test("разные товары с главной открываются по очереди", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: /HQD/ }).first().click();
  await expect(page).toHaveURL(/#product\/hqd/);
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  await page.getByRole("button", { name: /CHASER LUX/ }).first().click();
  await expect(page).toHaveURL(/#product\/chaser/);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
});

test("из каталога товар возвращает поиск, фильтр и прокрутку", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  const scroll = await page.locator(".body").evaluate((node) => {
    node.scrollTop = 120;
    const button = [...node.querySelectorAll("button")].find((item) => item.textContent === "Открыть" && item.getBoundingClientRect().bottom < window.innerHeight);
    button?.click();
    return node.scrollTop;
  });
  expect(scroll).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByRole("tab", { name: "Жидкости" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.locator(".body").evaluate((node) => node.scrollTop)).toBe(scroll);
  await page.getByRole("textbox", { name: "Поиск" }).fill("арбуз");
  await page.getByRole("article").filter({ hasText: "ELFLIQ" }).getByRole("button", { name: "Открыть" }).click();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveValue("арбуз");
  await expect(page.getByRole("tab", { name: "Жидкости" })).toHaveAttribute("aria-selected", "true");
});

test("после обновления открывается товар, а не каталог", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("elfin-age", "ok"));
  await page.goto("/#product/elfliq-watermelon");
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
});
