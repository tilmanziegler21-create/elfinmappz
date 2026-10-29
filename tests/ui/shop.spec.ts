import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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
  await expect(page.getByRole("button", { name: "Каталог" })).toBeVisible();
}

test("возраст: отказ, возврат и вход", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0);
  await page.getByRole("button", { name: "Мне нет 18" }).click();
  await expect(page.getByText("Доступ закрыт")).toBeVisible();
  await page.getByRole("button", { name: "Вернуться" }).click();
  await page.getByRole("button", { name: "Мне нет 18" }).click();
  await page.getByRole("button", { name: "Вернуться" }).click();
  await page.getByRole("button", { name: "Мне есть 18" }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
});

test("условия закрываются фоном и кнопкой", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Подробнее об условиях" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Закрыть условия" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Подробнее об условиях" }).click();
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("карточки главной открывают свои товары", async ({ page }) => {
  await openShop(page);
  for (const name of [/CHASER LUX/, /CHASER FP/, /HQD/]) {
    await page.getByRole("button", { name: "Главная" }).click();
    await page.getByRole("button", { name }).click();
    await expect(page).toHaveURL(/#product\//);
    await page.getByRole("button", { name: "Назад в каталог" }).click();
    await expect(page).not.toHaveURL(/#product\//);
  }
});

test("бренды жидкостей переключаются и сбрасываются", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "Жидкости" }).click();
  for (const brand of ["HQD", "VOZOL", "CHASER", "ELFLIQ"]) {
    await page.getByRole("tab", { name: brand, exact: true }).click();
    await expect(page.getByRole("tab", { name: brand, exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: brand, exact: true }).click();
    await expect(page.getByRole("tab", { name: brand, exact: true })).toHaveAttribute("aria-selected", "true");
  }
  await page.getByRole("tab", { name: "Все бренды" }).click();
  await expect(page.getByRole("tab", { name: "Все бренды" })).toHaveAttribute("aria-selected", "true");
});

test("кнопка каталога называется так же, как действует", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  const open = page.getByRole("button", { name: "Открыть" }).first();
  await expect(open).toBeVisible();
  await open.click();
  await expect(page).toHaveURL(/#product\//);
});

test("точки кадра меняют выбор и не прыгают по высоте", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  const scene = page.locator(".hero-scene");
  const before = await scene.boundingBox();
  await page.getByRole("button", { name: "Грань" }).click();
  await expect(page.getByRole("button", { name: "Грань" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Общий вид" }).click();
  await expect(page.getByRole("button", { name: "Общий вид" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Грань" }).click();
  const after = await scene.boundingBox();
  expect(before && after && Math.abs(before.height - after.height)).toBeLessThan(1);
});

test("поиск объёма фильтрует список и возвращает его", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await page.getByRole("button", { name: "Выбрать объём" }).click();
  const search = page.getByRole("textbox", { name: "Поиск объёма" });
  await search.fill("нет-такого");
  await expect(page.getByText("Такого объёма нет.")).toBeVisible();
  await search.fill("30");
  await expect(page.getByRole("option", { name: /30 мл/ })).toBeVisible();
  await search.fill("");
  await expect(page.getByRole("option", { name: /30 мл/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Объём" })).toHaveCount(0);
});

test("корзина удаляет позицию и возвращает её", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  await page.getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: /Корзина/ }).first().click();
  await expect(page.getByText("9,90 €").first()).toBeVisible();
  await page.getByRole("button", { name: /Убрать ELFLIQ/ }).click();
  await expect(page.getByText("Корзина пуста")).toBeVisible();
  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(page.getByText("9,90 €").first()).toBeVisible();
  await page.getByRole("button", { name: /Убрать ELFLIQ/ }).click();
  await expect(page.getByRole("button", { name: "В каталог" })).toBeVisible();
});

test("самовывоз и адрес меняют поля и не стирают имя", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  const name = page.getByRole("textbox", { name: "Имя" });
  await name.fill("Тест");
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await expect(page.getByRole("textbox", { name: "Адрес" })).toHaveCount(0);
  await page.getByRole("button", { name: "Адрес" }).click();
  await expect(page.getByRole("textbox", { name: "Адрес" })).toBeVisible();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByRole("button", { name: "Адрес" }).click();
  await expect(name).toHaveValue("Тест");
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Выберите курьера.");
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Выберите курьера.");
});

test("пустые заказы открывают каталог", async ({ page }) => {
  await page.route("**/api/order/history**", (route) => route.fulfill({ json: { orders: [] } }));
  await openShop(page);
  await page.getByRole("button", { name: "Заказы" }).click();
  await page.getByRole("button", { name: "Открыть каталог" }).click();
  await expect(page.getByRole("textbox", { name: "Поиск" })).toBeVisible();
  await page.getByRole("button", { name: "Заказы" }).click();
  await page.getByRole("button", { name: "Открыть каталог" }).click();
  await expect(page.getByRole("tab", { name: "Все" })).toBeVisible();
});

test("повтор заставки запрашивает магазин снова", async ({ page }) => {
  let blocked = true;
  await page.route("**/api/config", (route) => {
    if (blocked) return route.abort();
    return route.continue();
  });
  await page.goto("/");
  const retry = page.getByRole("button", { name: "Повторить" });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.getByText("Магазин не ответил")).toBeVisible();
  blocked = false;
  await retry.click();
  await expect(page.locator(".splash")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Мне есть 18" })).toBeVisible();
});

test("подробности заказа берутся из истории", async ({ page, request }) => {
  const auth = await request.post("http://127.0.0.1:8787/api/auth/dev", { data: { tgId: "123456789" } });
  const session = await auth.json();
  const created = await request.post("http://127.0.0.1:8787/api/order/create", {
    headers: { authorization: `Bearer ${session.token}` },
    data: { city: "HH", items: [{ productId: "north:10", quantity: 1, variant: "10 мл" }] },
  });
  expect(created.ok()).toBeTruthy();
  const body = await created.json();
  await request.post("http://127.0.0.1:8787/api/order/confirm", {
    headers: { authorization: `Bearer ${session.token}` },
    data: {
      orderId: body.orderId,
      city: "HH",
      deliveryMethod: "pickup",
      courier_id: "courier-north",
      delivery_date: "2026-10-28",
      delivery_time: "12:00",
      courierData: { address: "Северный вход", comment: "", user: { tgId: "123456789", name: "Тест", username: "elfin", contact: "@elfin" } },
    },
  });
  await openShop(page);
  await page.getByRole("button", { name: "Заказы" }).click();
  const more = page.getByRole("button", { name: "Подробнее", exact: true }).first();
  await more.click();
  await expect(page.getByText("Северный · 10 мл · 1").first()).toBeVisible();
  await expect(page.getByText("Курьер Север").first()).toBeVisible();
  await expect(page.getByText("Самовывоз", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Скрыть" }).click();
  await expect(page.getByText("Северный · 10 мл · 1")).toHaveCount(0);
  await page.getByRole("button", { name: "Подробнее", exact: true }).first().click();
  await expect(page.getByText("Курьер Север")).toBeVisible();
});

test("курьер и админ меняют статус изолированного заказа", async ({ page, request }) => {
  const auth = await request.post("http://127.0.0.1:8787/api/auth/dev", { data: { tgId: "123456789" } });
  const session = await auth.json();
  const created = await request.post("http://127.0.0.1:8787/api/order/create", {
    headers: { authorization: `Bearer ${session.token}` },
    data: { city: "HH", items: [{ productId: "clear:10", quantity: 1, variant: "10 мл" }] },
  });
  const body = await created.json();
  const confirmed = await request.post("http://127.0.0.1:8787/api/order/confirm", {
    headers: { authorization: `Bearer ${session.token}` },
    data: {
      orderId: body.orderId,
      city: "HH",
      deliveryMethod: "pickup",
      courier_id: "courier-north",
      delivery_date: "2026-10-28",
      delivery_time: "12:00",
      courierData: { address: "Северный вход", comment: "", user: { tgId: "123456789", name: "Тест", username: "elfin", contact: "@elfin" } },
    },
  });
  expect(confirmed.ok()).toBeTruthy();
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Админ", exact: true }).click();
  await page.getByRole("button", { name: "Админка" }).click();
  await page.getByRole("button", { name: "Назначить курьера" }).first().click();
  await expect(page.getByRole("button", { name: "В пути" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Север", exact: true }).click();
  await page.getByRole("button", { name: "Панель курьера" }).click();
  await page.getByRole("button", { name: "Не выдал" }).first().click();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByRole("button", { name: "Не выдал" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Не выдал" }).first().click();
  await page.getByRole("textbox", { name: "Причина" }).fill("Тестовая отмена");
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByText("Не выдано").first()).toBeVisible();
});

test("на публичном конфиге нет переключателя ролей", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.devAuth = false;
    await route.fulfill({ response, json });
  });
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await expect(page.getByRole("button", { name: "Админ" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Север" })).toHaveCount(0);
  await page.goto("/#/admin");
  await expect(page.getByText("Заказов нет.")).toHaveCount(0);
});

test("экраны не дают горизонтальный сдвиг", async ({ page }) => {
  await openShop(page);
  for (const size of [
    { width: 320, height: 700 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(size);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBe(false);
  }
});

test("при уменьшенном движении каталог остаётся кнопкой", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  await page.getByRole("tab", { name: "POD" }).click();
  await expect(page.getByRole("tab", { name: "POD" })).toHaveAttribute("aria-selected", "true");
});

test("прокрутка каталога не роняет кадры", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  const sample = await page.evaluate(async () => {
    const gaps: number[] = [];
    let last = performance.now();
    let run = true;
    const loop = (now: number) => {
      gaps.push(now - last);
      last = now;
      if (run) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const scroller = document.querySelector(".body");
    for (let i = 0; i < 20; i += 1) {
      if (scroller) scroller.scrollTop = i * 40;
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    run = false;
    const used = gaps.filter((gap) => gap > 0);
    return { worst: Math.max(...used, 0), count: used.length };
  });
  expect(sample.count).toBeGreaterThan(10);
  expect(sample.worst).toBeLessThan(50);
});

async function confirmedPickup(request: APIRequestContext, sku: string) {
  const auth = await request.post("http://127.0.0.1:8787/api/auth/dev", { data: { tgId: "123456789" } });
  const session = await auth.json();
  const created = await request.post("http://127.0.0.1:8787/api/order/create", {
    headers: { authorization: `Bearer ${session.token}` },
    data: { city: "HH", items: [{ productId: sku, quantity: 1, variant: "10 мл" }] },
  });
  const body = await created.json();
  const confirmed = await request.post("http://127.0.0.1:8787/api/order/confirm", {
    headers: { authorization: `Bearer ${session.token}` },
    data: {
      orderId: body.orderId,
      city: "HH",
      deliveryMethod: "pickup",
      courier_id: "courier-north",
      delivery_date: "2026-10-28",
      delivery_time: "12:00",
      courierData: { address: "Северный вход", comment: "", user: { tgId: "123456789", name: "Тест", username: "elfin", contact: "@elfin" } },
    },
  });
  expect(confirmed.ok()).toBeTruthy();
  return String(body.orderId);
}

test("админ отменяет, курьер подтверждает выдачу", async ({ page, request }) => {
  const cancelId = await confirmedPickup(request, "north:10");
  const deliverId = await confirmedPickup(request, "clear:10");
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Админ", exact: true }).click();
  await page.getByRole("button", { name: "Админка" }).click();
  const cancelCard = page.locator("article", { hasText: cancelId });
  await cancelCard.getByRole("button", { name: "Отменить" }).click();
  await expect(cancelCard.getByText("Отменён")).toBeVisible();
  const deliverCard = page.locator("article", { hasText: deliverId });
  await deliverCard.getByRole("button", { name: "Назначить курьера" }).click();
  await expect(deliverCard.getByRole("button", { name: "В пути" })).toBeVisible();
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Север", exact: true }).click();
  await page.getByRole("button", { name: "Панель курьера" }).click();
  const courierCard = page.locator("article", { hasText: deliverId });
  await courierCard.getByRole("button", { name: "Выдал", exact: true }).click();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(courierCard.getByRole("button", { name: "Выдал", exact: true })).toBeVisible();
  await courierCard.getByRole("button", { name: "Выдал", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Подтвердить выдачу?");
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(courierCard.getByText("Выдано")).toBeVisible();
});

test("без входа оформление называет Telegram и не чистит корзину", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.devAuth = false;
    await route.fulfill({ response, json });
  });
  await openShop(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Откройте магазин через Telegram, чтобы подтвердить заказ.");
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Откройте магазин через Telegram, чтобы подтвердить заказ.");
  expect(await page.evaluate(() => localStorage.getItem("elfin-cart"))).toContain("elfliq-watermelon:30");
});

test("отказ API оставляет корзину и показывает причину", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  let mode = "pass";
  await page.route("**/api/order/create", (route) => {
    if (mode === "down") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ORDERS_NEED_DATABASE" }) });
    if (mode === "abort") return route.abort();
    if (mode === "missing") return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Product not found: elfliq-watermelon:30" }) });
    return route.continue();
  });
  await openShop(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("dialog", { name: "Оформление заказа" })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть оформление" }).click({ position: { x: 16, y: 16 } });
  await expect(page.locator(".sheet-layer.is-open")).toHaveCount(0);
  await page.getByRole("button", { name: "К оформлению" }).click();
  await page.getByRole("combobox", { name: "Курьер" }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Укажите адрес.");
  await page.getByRole("button", { name: "Самовывоз" }).click();
  mode = "down";
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Оформление тестовых заказов пока недоступно.");
  mode = "missing";
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Заказ не удалось сохранить. Попробуйте ещё раз.");
  mode = "abort";
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByRole("alert")).toContainText("Заказ не удалось сохранить. Попробуйте ещё раз.");
  expect(await page.evaluate(() => localStorage.getItem("elfin-cart"))).toContain("elfliq-watermelon:30");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(page.getByText("9,90 €").first()).toBeVisible();
});

test("история показывает 401, 500 и повтор", async ({ page }) => {
  let mode = "auth";
  await page.route("**/api/order/history**", (route) => {
    if (mode === "auth") return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Authentication required" }) });
    if (mode === "server") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Ошибка запроса" }) });
    return route.fulfill({ json: { orders: [] } });
  });
  await openShop(page);
  await page.getByRole("button", { name: "Заказы" }).click();
  await expect(page.getByRole("alert")).toContainText("Authentication required");
  mode = "server";
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("alert")).toContainText("Ошибка запроса");
  mode = "ok";
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByText("Заказов пока нет")).toBeVisible();
});
