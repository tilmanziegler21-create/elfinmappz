import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

test.use({ video: "on" });

test.afterEach(async ({ page }) => {
  const video = page.video();
  await page.close();
  mkdirSync("artifacts/transitions", { recursive: true });
  if (video) await video.saveAs(process.env.TRANSITION_VIDEO || "artifacts/transitions/after.webm");
});

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

async function watch(page: Page) {
  await page.evaluate(() => {
    const frames: Array<{ empty: boolean; navY: number; navH: number; rootH: number; gap: number }> = [];
    const tasks: number[] = [];
    const nav = document.querySelector(".nav")?.getBoundingClientRect();
    const root = document.getElementById("root")?.getBoundingClientRect();
    let last = performance.now();
    let run = true;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration >= 50) tasks.push(Math.round(entry.duration));
    });
    observer.observe({ type: "longtask", buffered: false });
    const sample = (now: number) => {
      const box = document.querySelector(".nav")?.getBoundingClientRect();
      const shell = document.getElementById("root")?.getBoundingClientRect();
      const text = [...document.querySelectorAll(".body > section:not([hidden]), .body > .product-page")]
        .map((node) => node.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      frames.push({
        empty: text.length < 2,
        navY: Math.round(box?.width ? box.y : -1),
        navH: Math.round(box?.width ? box.height : 0),
        rootH: Math.round(shell?.height ?? -1),
        gap: Math.round(now - last),
      });
      last = now;
      if (run) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    (window as unknown as { __nav0?: { y: number; h: number; root: number }; __stopWatch?: () => unknown }).__nav0 = {
      y: Math.round(nav?.y ?? -1),
      h: Math.round(nav?.height ?? -1),
      root: Math.round(root?.height ?? -1),
    };
    (window as unknown as { __stopWatch?: () => unknown }).__stopWatch = () => {
      run = false;
      observer.disconnect();
      return { frames, tasks };
    };
  });
}

test("вкладки сменяются без пустого кадра и без сдвига панели", async ({ page }) => {
  test.setTimeout(90_000);
  await openShop(page);
  await watch(page);
  const nav = page.getByRole("navigation", { name: "Разделы" });
  const tabs = ["Каталог", "Корзина", "Заказы", "Профиль", "Главная"] as const;

  for (const name of tabs) await nav.getByRole("button", { name }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();

  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();

  await nav.getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  const scroll = await page.locator(".body").evaluate((node) => {
    node.scrollTop = 120;
    const button = [...node.querySelectorAll("button")].find((item) => item.textContent === "Открыть");
    button?.click();
    return node.scrollTop;
  });
  await expect(page.getByRole("button", { name: "Назад в каталог" })).toBeVisible();
  await page.getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: "Назад в каталог" }).click();
  await expect(page.getByRole("tab", { name: "Жидкости" })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => page.locator(".body").evaluate((node) => node.scrollTop)).toBe(scroll);

  await nav.getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("dialog", { name: "Оформление заказа" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.locator(".sheet-layer.is-open")).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Корзина" })).toBeVisible();

  for (let i = 0; i < 20; i += 1) {
    await nav.getByRole("button", { name: tabs[i % tabs.length] }).click();
  }

  const report = await page.evaluate(() => {
    const stopped = (window as unknown as { __stopWatch?: () => { frames: Array<{ empty: boolean; navY: number; navH: number; rootH: number; gap: number }>; tasks: number[] } }).__stopWatch?.();
    const origin = (window as unknown as { __nav0?: { y: number; h: number; root: number } }).__nav0;
    const frames = stopped?.frames ?? [];
    const visible = frames.filter((frame) => frame.navY >= 0);
    return {
      empty: frames.filter((frame) => frame.empty).length,
      frames: frames.length,
      maxGap: frames.reduce((max, frame) => Math.max(max, frame.gap), 0),
      navShift: visible.filter((frame) => frame.navH > 0).reduce((max, frame) => Math.max(max, Math.abs(frame.navY - (origin?.y ?? frame.navY)), Math.abs(frame.navH - (origin?.h ?? frame.navH))), 0),
      rootShift: visible.reduce((max, frame) => Math.max(max, Math.abs(frame.rootH - (origin?.root ?? frame.rootH))), 0),
      longTasks: stopped?.tasks ?? [],
    };
  });
  mkdirSync("artifacts/transitions", { recursive: true });
  writeFileSync("artifacts/transitions/frames.json", JSON.stringify(report));
  expect(report.empty).toBe(0);
  expect(report.navShift).toBeLessThanOrEqual(1);
  expect(report.rootShift).toBeLessThanOrEqual(1);
});
