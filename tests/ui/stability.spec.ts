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
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
}

test("нижняя навигация остаётся после переходов и оформления", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  const bar = page.getByRole("navigation", { name: "Разделы" });
  await page.getByRole("button", { name: "Каталог" }).click();
  await expect(bar).toBeVisible();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await expect(bar).toBeVisible();
  await page.getByRole("button", { name: "Главная" }).click();
  await expect(bar).toBeVisible();
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  for (let i = 0; i < 10; i += 1) {
    await page.getByRole("button", { name: "К оформлению" }).click();
    await expect(page.getByRole("dialog", { name: "Оформление заказа" })).toBeVisible();
    await expect(bar).toBeHidden();
    await page.getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(bar).toBeVisible();
  }
  await page.getByRole("button", { name: "Главная" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  await expect(bar).toBeVisible();
});

test("быстрые вкладки не снимают нижнюю навигацию", async ({ page }) => {
  await openShop(page);
  const bar = page.getByRole("navigation", { name: "Разделы" });
  const tabs = ["Каталог", "Корзина", "Заказы", "Профиль", "Главная"];
  for (let i = 0; i < 20; i += 1) {
    await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: tabs[i % tabs.length] }).click();
    await expect(bar).toBeVisible();
  }
});

test("товар, фильтр и панель варианта возвращают навигацию", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  await page.getByRole("article").filter({ hasText: "ELFLIQ" }).getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeHidden();
  await page.getByRole("button", { name: "Выбрать объём" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /В корзину/ })).toBeVisible();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Жидкости" })).toHaveAttribute("aria-selected", "true");
});

test("узкий и короткий экран оставляют навигацию в кадре", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  for (const size of [
    { width: 320, height: 700 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(size);
    const bar = page.getByRole("navigation", { name: "Разделы" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    expect(box!.y).toBeGreaterThan(size.height - 140);
  }
  await page.setViewportSize({ width: 390, height: 520 });
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  const confirm = page.getByRole("button", { name: "Подтвердить заказ" });
  await expect(confirm).toBeVisible();
  const box = await confirm.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.y + box!.height).toBeLessThanOrEqual(520);
});

async function barState(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector(".nav");
    if (!(nav instanceof HTMLElement)) return { shown: false, hits: false, covered: "missing" };
    const style = getComputedStyle(nav);
    const shown = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    const buttons = [...nav.querySelectorAll(".nav-btn")];
    const hits = buttons.every((button) => {
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === button || button.contains(target);
    });
    return { shown, hits };
  });
}

test("цепочка экранов не теряет и не перекрывает нижний бар", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  const frames: string[] = [];
  await page.exposeBinding("navFrame", (_source, value: string) => { frames.push(value); });
  await page.evaluate(() => {
    const send = (window as unknown as { navFrame?: (value: string) => void }).navFrame;
    const loop = () => {
      const nav = document.querySelector(".nav");
      const style = nav ? getComputedStyle(nav) : null;
      const hidden = !style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
      const home = document.body.innerText.includes("Всё в одном месте");
      const product = Boolean(document.querySelector(".product-page"));
      const catalogNode = document.querySelector(".catalog-tools");
      const catalog = Boolean(catalogNode?.closest("section:not([hidden])"));
      send?.(`${hidden ? "hidden" : "shown"}:${home ? "home" : ""}${product ? "product" : ""}${catalog ? "catalog" : ""}`);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

  expect((await barState(page)).shown).toBe(true);
  expect((await barState(page)).hits).toBe(true);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  expect((await barState(page)).shown).toBe(false);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  expect((await barState(page)).shown).toBe(true);
  expect((await barState(page)).hits).toBe(true);

  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Каталог" }).click();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toBeVisible();
  expect((await barState(page)).hits).toBe(true);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await expect(page.getByRole("button", { name: "К оформлению" })).toBeVisible();
  expect((await barState(page)).hits).toBe(true);
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("button", { name: "Подтвердить заказ" })).toBeVisible();
  expect((await barState(page)).shown).toBe(false);
  const confirmHit = await page.getByRole("button", { name: "Подтвердить заказ" }).evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || button.contains(target);
  });
  expect(confirmHit).toBe(true);
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".sheet-layer.is-open")).toHaveCount(0);
  await expect.poll(async () => (await barState(page)).hits).toBe(true);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByText("Роль")).toBeVisible();
  expect((await barState(page)).hits).toBe(true);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Главная" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  expect((await barState(page)).hits).toBe(true);

  const badFrames = frames.filter((frame) => frame.startsWith("hidden:home") || frame.startsWith("hidden:catalog") || frame.startsWith("shown:product") || frame.includes("hiddencatalog"));
  expect(badFrames).toEqual([]);
});

test("при уменьшенном движении вкладки остаются нажимаемыми", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).tap();
  await page.getByRole("tab", { name: "POD" }).tap();
  await expect(page.getByRole("tab", { name: "POD" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible();
});
