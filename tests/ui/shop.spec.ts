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
  await expect(page.getByText("Уровень покупателя")).toHaveCount(0);
  await expect(page.getByText("−5%")).toHaveCount(0);
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

test("одна фотография товара не листается", async ({ page }) => {
  await openShop(page);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  const scene = page.locator(".hero-scene");
  const before = await scene.boundingBox();
  await expect(page.getByRole("tablist", { name: "Изображения" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Грань" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Общий вид" })).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-frames", "1");
  const image = scene.locator("img");
  await expect(image).toHaveCount(1);
  const src = await image.getAttribute("src");
  const box = await scene.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 24, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 24, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("src", src ?? "");
  const after = await scene.boundingBox();
  expect(before && after && Math.abs(before.height - after.height)).toBeLessThan(1);
});

test("фото линейки остаётся при смене вкуса", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.catalog = "sheets";
    await route.fulfill({ response, json });
  });
  await page.route("**/api/catalog**", (route) => route.fulfill({
    json: {
      source: "sheets",
      products: [
        { id: "1", sku: "LQ-1", name: "Blackberry Lemon", category: "liquids", brand: "ELFLIQ", price: 18, stock: 6, active: true },
        { id: "2", sku: "LQ-2", name: "Blue Razz Ice", category: "liquids", brand: "ELFLIQ", price: 19, stock: 3, active: true },
        { id: "3", sku: "CH-1", name: "Turbo Mint", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 4, active: true },
        { id: "4", sku: "HQ-1", name: "Grapey", category: "liquids", brand: "HQD", price: 17, stock: 2, active: true },
        { id: "5", sku: "VZ-1", name: "Strawberry Ice", category: "liquids", brand: "VOZOL", price: 21, stock: 5, active: true },
      ],
    },
  }));
  await openShop(page);
  await expect(page.getByText("Нет фото этого вкуса")).toHaveCount(0);
  const lines = [
    [/ELFLIQ/, "/products/elfliq-watermelon.png"],
    [/CHASER/, "/assets/products/liquids/chaser-lux-turbo-mint.png"],
    [/HQD/, "/assets/products/liquids/hqd-grapey.png"],
    [/VOZOL/, "/assets/products/liquids/vozol-strawberry-ice.png"],
  ] as const;
  for (const [name, src] of lines) {
    await page.getByRole("button", { name }).first().click();
    const image = page.locator(".hero-scene img");
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute("src", src);
    await expect(page.getByText("Нет фото этого вкуса")).toHaveCount(0);
    await expect(page.getByRole("tablist", { name: "Изображения" })).toHaveCount(0);
    await page.getByRole("button", { name: "Назад в каталог" }).click();
  }
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  const image = page.locator(".hero-scene img");
  await page.getByRole("button", { name: "Выбрать вкус" }).click();
  await page.getByRole("option", { name: /Blue Razz Ice/ }).click();
  await expect(image).toHaveAttribute("src", "/products/elfliq-watermelon.png");
  await expect(page.locator(".product-kicker")).toHaveText("Blue Razz Ice");
  await expect(page.getByText("19,00").first()).toBeVisible();
  await expect(page.locator(".hero-scene img")).toHaveCount(1);
});

test("линейки CHASER не смешиваются", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.catalog = "sheets";
    await route.fulfill({ response, json });
  });
  await page.route("**/api/catalog**", (route) => route.fulfill({
    json: {
      source: "sheets",
      products: [
        { id: "1", sku: "LQ-0013", name: "Blue Razz Ice", category: "liquids", brand: "ELFLIQ", price: 18, stock: 5, active: true },
        { id: "2", sku: "LQ-0027", name: "Watermelon", category: "liquids", brand: "ELFLIQ", price: 18, stock: 2, active: true },
        { id: "3", sku: "LQ-0030", name: "Strawberry Ice", category: "liquids", brand: "HQD", price: 18, stock: 9, active: true },
        { id: "4", sku: "LQ-0031", name: "Lemon Lime", category: "liquids", brand: "VOZOL", price: 18, stock: 1, active: true },
        { id: "5", sku: "LQ-0032", name: "Perfume Lemon", category: "liquids", brand: "VOZOL", price: 18, stock: 3, active: true },
        { id: "6", sku: "LQ-0033", name: "Tropic Punch", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "7", sku: "LQ-0034", name: "Tea Peach", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "8", sku: "LQ-0035", name: "Vitamin", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "9", sku: "LQ-0036", name: "Kiwi Passion Fruit Guava", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "10", sku: "LQ-0037", name: "Sangria", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 2, active: true },
        { id: "11", sku: "LQ-0038", name: "Peach Yougurt", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "12", sku: "LQ-0039", name: "Energetic", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 2, active: true },
        { id: "13", sku: "LQ-0040", name: "Sour Apple", category: "liquids1", brand: "Chaser Lux", price: 20, stock: 1, active: true },
        { id: "14", sku: "LQ-0041", name: "Лимон", category: "liquids1", brand: "CHASER F/P", price: 20, stock: 1, active: true },
        { id: "15", sku: "LQ-0042", name: "Tripple Raspberry", category: "liquids1", brand: "Chaser ULTRA", price: 20, stock: 1, active: true },
        { id: "16", sku: "LQ-0043", name: "Energy Raspberry", category: "liquids1", brand: "Chaser ULTRA", price: 20, stock: 2, active: true },
      ],
    },
  }));
  await openShop(page);
  const catalog = page.locator("section.is-current");
  const lineCard = (title: string) => catalog.locator("article").filter({ has: page.locator("h3", { hasText: new RegExp(`^${title}$`) }) });
  await page.getByRole("button", { name: "Каталог" }).click();
  await expect(lineCard("CHASER LUX")).toHaveCount(1);
  await expect(lineCard("CHASER F/P")).toHaveCount(1);
  await expect(lineCard("CHASER ULTRA")).toHaveCount(1);
  await expect(lineCard("ELFLIQ")).toHaveCount(1);
  await expect(lineCard("VOZOL")).toHaveCount(1);
  await expect(lineCard("CHASER LUX").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-lux-turbo-mint.png");
  await expect(lineCard("CHASER F/P").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-fp-barberry.png");
  await expect(lineCard("CHASER ULTRA").locator("img")).toHaveCount(0);
  await expect(lineCard("CHASER ULTRA").getByText("Нет фото")).toBeVisible();
  await lineCard("CHASER LUX").evaluate((node) => node.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "artifacts/chaser-lines/dark-catalog.png" });

  async function openLine(title: string) {
    await page.getByRole("button", { name: "Каталог" }).click();
    await expect(page.locator(".product-page")).toHaveCount(0);
    await lineCard(title).locator("h3").click();
    await expect(page.locator(".product-page")).toBeVisible();
  }

  async function shot(path: string) {
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.locator(".product-page").evaluate((node) => {
      node.scrollIntoView({ block: "start", inline: "start" });
      let parent = node.parentElement;
      while (parent) {
        parent.scrollTop = 0;
        parent = parent.parentElement;
      }
      const scroll = node.querySelector(".product-scroll");
      if (scroll instanceof HTMLElement) scroll.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path });
  }

  async function flavors() {
    await page.locator(".product-page").getByRole("button", { name: "Выбрать вкус" }).click();
    const options = page.getByRole("option");
    const text = await options.allTextContents();
    return text;
  }

  await openLine("CHASER LUX");
  let names = await flavors();
  expect(names).toHaveLength(8);
  for (const flavor of ["Tropic Punch", "Tea Peach", "Vitamin", "Kiwi Passion Fruit Guava", "Sangria", "Peach Yougurt", "Energetic", "Sour Apple"]) {
    expect(names.some((item) => item.includes(flavor))).toBeTruthy();
  }
  expect(names.some((item) => item.includes("Лимон") || item.includes("Energy Raspberry") || item.includes("Tripple Raspberry"))).toBeFalsy();
  const punch = page.getByRole("option", { name: /Tropic Punch/ });
  await expect(punch).toContainText("20,00");
  await expect(punch).toContainText("· 1");
  await punch.click();
  await expect(page.locator(".product-page .hero-scene img")).toHaveAttribute("src", "/assets/products/liquids/chaser-lux-turbo-mint.png");
  await shot("artifacts/chaser-lines/dark-lux.png");
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();

  await openLine("CHASER F/P");
  names = await flavors();
  expect(names).toHaveLength(1);
  expect(names[0]).toContain("Лимон");
  expect(names[0]).toContain("· 1");
  await page.getByRole("option", { name: /Лимон/ }).click();
  await expect(page.locator(".product-page .hero-scene img")).toHaveAttribute("src", "/assets/products/liquids/chaser-fp-barberry.png");
  await expect(page.locator(".product-heading")).toHaveText("CHASER F/P");
  await shot("artifacts/chaser-lines/dark-fp.png");
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();

  await openLine("CHASER ULTRA");
  names = await flavors();
  expect(names).toHaveLength(2);
  expect(names.some((item) => item.includes("Tripple Raspberry") && item.includes("· 1"))).toBeTruthy();
  expect(names.some((item) => item.includes("Energy Raspberry") && item.includes("· 2"))).toBeTruthy();
  expect(names.some((item) => item.includes("Tropic Punch") || item.includes("Лимон"))).toBeFalsy();
  await page.getByRole("option", { name: /Energy Raspberry/ }).click();
  await expect(page.locator(".product-page .hero-scene img")).toHaveCount(0);
  await expect(page.locator(".product-page .float-stage")).toHaveAttribute("data-image", "crystal");
  await expect(page.locator(".product-heading")).toHaveText("CHASER ULTRA");
  await shot("artifacts/chaser-lines/dark-ultra.png");
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();

  const stored = await page.evaluate(() => localStorage.getItem("elfin-cart"));
  expect(stored).toContain("chaser-lux:LQ-0033");
  expect(stored).toContain("chaser-f-p:LQ-0041");
  expect(stored).toContain("chaser-ultra:LQ-0043");
  await page.getByRole("button", { name: "Корзина" }).click();
  const cart = page.locator("section.is-current");
  await expect(cart.getByText("CHASER LUX").first()).toBeVisible();
  await expect(cart.getByText("Tropic Punch").first()).toBeVisible();
  await expect(cart.getByText("CHASER F/P").first()).toBeVisible();
  await expect(cart.getByText("Лимон").first()).toBeVisible();
  await expect(cart.getByText("CHASER ULTRA").first()).toBeVisible();
  await expect(cart.getByText("Energy Raspberry").first()).toBeVisible();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByText("CHASER LUX — Tropic Punch")).toBeVisible();
  await expect(page.getByText("CHASER F/P — Лимон")).toBeVisible();
  await expect(page.getByText("CHASER ULTRA — Energy Raspberry")).toBeVisible();
  await page.locator(".sheet-layer.is-open").getByRole("button", { name: "Закрыть", exact: true }).click();

  await page.getByRole("button", { name: "Главная" }).click();
  await page.getByRole("button", { name: "Светлая тема" }).click();
  await page.getByRole("button", { name: "Каталог" }).click();
  await lineCard("CHASER LUX").evaluate((node) => node.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "artifacts/chaser-lines/light-catalog.png" });
  await openLine("CHASER LUX");
  await shot("artifacts/chaser-lines/light-lux.png");
  await openLine("CHASER F/P");
  await shot("artifacts/chaser-lines/light-fp.png");
  await openLine("CHASER ULTRA");
  await shot("artifacts/chaser-lines/light-ultra.png");
  await expect(page.locator(".product-page .hero-scene img")).toHaveCount(0);
});

test("вкусы одной жидкости собраны в одну карточку", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.catalog = "sheets";
    await route.fulfill({ response, json });
  });
  await page.route("**/api/catalog**", (route) => route.fulfill({
    json: {
      source: "sheets",
      products: [
        { sku: "LQ-001", name: "Lemon Lime", category: "liquids", brand: "ELFLIQ", price: 18, stock: 11, active: true },
        { sku: "LQ-0012", name: "Blueberry", category: "liquids", brand: "ELFLIQ", price: 18, stock: 21, active: true },
        { sku: "LQ-0031", name: "Lemon Lime", category: "liquids", brand: "VOZOL", price: 18, stock: 2, active: true },
        { sku: "LQ-0059", name: "Mint Ice", category: "liquids", brand: "VOZOL", price: 18, stock: 5, active: true },
        { sku: "LQ-0062", name: "Blackberry Sour Raspberry", category: "liquids1", brand: "CHASER BLACK 50MG", price: 20, stock: 4, active: true },
        { sku: "LQ-0073", name: "Triple Raspberry", category: "liquids1", brand: "CHASER BLACK 50MG", price: 20, stock: 4, active: true },
        { sku: "LQ-0088", name: "Tropic Punch", category: "liquids1", brand: "CHASER LUX 50MG", price: 20, stock: 2, active: true },
        { sku: "LQ-0090", name: "Turbo Mint", category: "liquids1", brand: "CHASER LUX 50MG", price: 20, stock: 2, active: true },
        { sku: "LQ-0092", name: "Банан", category: "liquids1", brand: "CHASER F/P 50MG", price: 20, stock: 1, active: true },
        { sku: "LQ-00100", name: "Лимон", category: "liquids1", brand: "CHASER F/P 50MG", price: 20, stock: 1, active: true },
        { sku: "LQ-00106", name: "Aloe Mint", category: "liquids1", brand: "CHASER SQUID GAME 50MG", price: 20, stock: 3, active: true },
        { sku: "LQ-00109", name: "Balerina Cappuccino", category: "liquids1", brand: "Chaser Limited Edition", price: 20, stock: 3, active: true },
        { sku: "EL-001", name: "Cartridge 0.8Om /pack", category: "CARTRIDGE", brand: "CARTRIDGE XROS", price: 24, stock: 10, active: true },
      ],
    },
  }));
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  const catalog = page.locator("section.is-current");
  const card = (title: string) => catalog.locator("article").filter({ has: page.locator("h3", { hasText: new RegExp(`^${title}$`) }) });
  for (const title of ["ELFLIQ", "VOZOL", "CHASER BLACK 50MG", "CHASER LUX 50MG", "CHASER F/P 50MG", "CHASER SQUID GAME 50MG", "CHASER LIMITED EDITION", "Cartridge 0.8Om /pack"]) {
    await expect(card(title)).toHaveCount(1);
  }
  await expect(catalog.locator("article")).toHaveCount(8);
  await expect(card("ELFLIQ")).toContainText("2 вкуса");
  await expect(card("CHASER BLACK 50MG")).toContainText("2 вкуса");
  await expect(card("CHASER LUX 50MG").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-lux-turbo-mint.png");
  await expect(card("CHASER F/P 50MG").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-fp-barberry.png");
  await expect(card("CHASER BLACK 50MG").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-black-blueberry-gum.png");
  await expect(card("CHASER SQUID GAME 50MG").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-squid-game.png");
  await expect(card("CHASER LIMITED EDITION").locator("img")).toHaveAttribute("src", "/assets/products/liquids/chaser-special-7years.png");
  await expect(card("Cartridge 0.8Om /pack").locator("img")).toHaveAttribute("src", "/assets/products/pods/xros-08-mesh-4pcs.png");

  await card("CHASER LUX 50MG").locator("h3").click();
  await page.locator(".product-page").getByRole("button", { name: "Выбрать вкус" }).click();
  const lux = await page.getByRole("option").allTextContents();
  expect(lux).toHaveLength(2);
  expect(lux.some((item) => item.includes("Turbo Mint") && item.includes("· 2"))).toBeTruthy();
  expect(lux.some((item) => item.includes("Tropic Punch") && item.includes("· 2"))).toBeTruthy();
  expect(lux.some((item) => item.includes("Банан") || item.includes("Triple Raspberry"))).toBeFalsy();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Каталог" }).click();
  await card("CHASER F/P 50MG").locator("h3").click();
  await page.locator(".product-page").getByRole("button", { name: "Выбрать вкус" }).click();
  const fp = await page.getByRole("option").allTextContents();
  expect(fp).toHaveLength(2);
  expect(fp.some((item) => item.includes("Банан") && item.includes("· 1"))).toBeTruthy();
  expect(fp.some((item) => item.includes("Лимон") && item.includes("· 1"))).toBeTruthy();
  await expect(page.locator(".product-page .hero-scene img")).toHaveAttribute("src", "/assets/products/liquids/chaser-fp-barberry.png");
});

test("количество меняет цену жидкостей и Chaser отдельно", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.catalog = "sheets";
    await route.fulfill({ response, json });
  });
  await page.route("**/api/catalog**", (route) => route.fulfill({
    json: {
      source: "sheets",
      liquidPrices: { liquids: { 1: 18, 2: 16, 3: 15 } },
      products: [
        { sku: "LQ-001", name: "Lemon Lime", category: "liquids", brand: "ELFLIQ", price: 18, stock: 11, active: true },
        { sku: "LQ-0031", name: "Lemon Lime", category: "liquids", brand: "VOZOL", price: 18, stock: 5, active: true },
        { sku: "LQ-0088", name: "Tropic Punch", category: "liquids1", brand: "CHASER LUX 50MG", price: 20, stock: 4, active: true },
      ],
    },
  }));
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  const catalog = page.locator("section.is-current");
  const card = (title: string) => catalog.locator("article").filter({ has: page.locator("h3", { hasText: new RegExp(`^${title}$`) }) });
  await expect(card("ELFLIQ")).toContainText("18,00");
  await card("ELFLIQ").locator("h3").click();
  await page.locator(".product-page").getByRole("button", { name: "Больше" }).click();
  await expect(page.locator(".product-page").getByRole("button", { name: /В корзину/ })).toContainText("32,00");
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: "Корзина" }).click();
  await expect(page.locator(".cart-item")).toContainText("16,00");
  await expect(page.locator(".cart-bar")).toContainText("32,00");
  await page.getByRole("button", { name: "Каталог" }).click();
  await card("CHASER LUX 50MG").locator("h3").click();
  await page.locator(".product-page").getByRole("button", { name: "Больше" }).click();
  await page.locator(".product-page").getByRole("button", { name: "Больше" }).click();
  await expect(page.locator(".product-page").getByRole("button", { name: /В корзину/ })).toContainText("51,00");
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: "Корзина" }).click();
  await expect(page.locator(".cart-bar")).toContainText("83,00");
});

test("повторная покупка не даёт процентную скидку", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.catalog = "sheets";
    await route.fulfill({ response, json });
  });
  await page.route("**/api/order/history**", (route) => route.fulfill({
    json: { orders: [], loyalty: { step: 2, percent: 5 } },
  }));
  await page.route("**/api/catalog**", (route) => route.fulfill({
    json: {
      source: "sheets",
      liquidPrices: { liquids: { 1: 18, 2: 16, 3: 15 } },
      products: [
        { sku: "LQ-001", name: "Lemon Lime", category: "liquids", brand: "ELFLIQ", price: 18, stock: 11, active: true },
        { sku: "LQ-0088", name: "Tropic Punch", category: "liquids1", brand: "CHASER LUX 50MG", price: 20, stock: 4, active: true },
      ],
    },
  }));
  await openShop(page);
  await page.getByRole("button", { name: "Каталог" }).click();
  const catalog = page.locator("section.is-current");
  await catalog.locator("article").filter({ has: page.locator("h3", { hasText: /^ELFLIQ$/ }) }).locator("h3").click();
  await page.locator(".product-page").getByRole("button", { name: "Больше" }).click();
  await page.locator(".product-page").getByRole("button", { name: /В корзину/ }).click();
  await page.getByRole("button", { name: "Корзина" }).click();
  await expect(page.locator(".cart-bar")).not.toContainText("Скидка");
  await expect(page.locator(".cart-bar")).toContainText("32,00");
  await expect(page.locator(".cart-bar")).not.toContainText("30,40");
});

test("характеристики на 320 не остаются под кнопкой", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openShop(page);
  await page.getByRole("button", { name: /ELFLIQ/ }).first().click();
  const fact = page.locator(".facts .fact").last();
  const buy = page.getByRole("button", { name: /В корзину/ });
  await fact.scrollIntoViewIfNeeded();
  const factBox = await fact.boundingBox();
  const buyBox = await buy.boundingBox();
  expect(factBox && buyBox).toBeTruthy();
  expect(factBox!.y + factBox!.height).toBeLessThanOrEqual(buyBox!.y + 1);
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

test("оформление без имени и адреса показывает Telegram ID", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  await openShop(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await expect(page.getByRole("textbox", { name: "Имя" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Адрес" })).toHaveCount(0);
  await expect(page.getByText("Telegram ID")).toBeVisible();
  await expect(page.getByText("123456789")).toBeVisible();
  await page.getByRole("button", { name: "Доставка" }).click();
  await expect(page.getByRole("textbox", { name: "Адрес" })).toHaveCount(0);
  await page.getByRole("button", { name: "Самовывоз" }).click();
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
  await expect(page.getByText("ELFIN — Северный — 10 мл × 1").first()).toBeVisible();
  await expect(page.getByText("@customer_example").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Заказ #/ }).first()).toBeVisible();
  await expect(page.getByText("Курьер Север").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Написать курьеру/ })).toHaveAttribute("href", "https://t.me/courier_north");
  await expect(page.getByText("Самовывоз", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Скрыть" }).click();
  await expect(page.getByText("ELFIN — Северный — 10 мл × 1")).toHaveCount(0);
  await page.getByRole("button", { name: /Заказ #/ }).first().click();
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
  return { orderId: String(body.orderId), displayNumber: Number(body.displayNumber) };
}

test("админ отменяет, курьер подтверждает выдачу", async ({ page, request }) => {
  const cancel = await confirmedPickup(request, "north:10");
  const deliver = await confirmedPickup(request, "clear:10");
  await openShop(page);
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Админ", exact: true }).click();
  await page.getByRole("button", { name: "Админка" }).click();
  const cancelCard = page.locator("article", { hasText: cancel.orderId });
  await cancelCard.getByRole("button", { name: "Отменить" }).click();
  await expect(cancelCard.getByText("Отменён")).toBeVisible();
  const deliverCard = page.locator("article", { hasText: deliver.orderId });
  await deliverCard.getByRole("button", { name: "Назначить курьера" }).click();
  await expect(deliverCard.getByRole("button", { name: "В пути" })).toBeVisible();
  await page.getByRole("button", { name: "Профиль" }).click();
  await page.getByRole("button", { name: "Север", exact: true }).click();
  await page.getByRole("button", { name: "Панель курьера" }).click();
  const courierCard = page.locator("article", { hasText: `Заказ #${deliver.displayNumber}` });
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
  const confirm = page.getByRole("button", { name: "Подтвердить заказ" });
  await expect(confirm).toBeDisabled();
  await expect(page.getByText("Откройте магазин через Telegram, чтобы подтвердить заказ.")).toBeVisible();
  await confirm.click({ force: true });
  await expect(confirm).toBeDisabled();
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

test("сохранённый заказ остаётся успешным и даёт связь с курьером", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("elfin-cart", JSON.stringify({ "elfliq-watermelon:30": 1 })));
  let creates = 0;
  await page.route("**/api/order/create", async (route) => {
    creates += 1;
    await route.fulfill({ json: { orderId: "ORD-TEST1" } });
  });
  await page.route("**/api/order/confirm", async (route) => {
    await route.fulfill({ json: { success: true, telegram: false, orderId: "ORD-TEST1", courierName: "Север", writeCourier: { url: "https://t.me/courier_north" } } });
  });
  await page.route("**/api/order/payment", async (route) => {
    await route.fulfill({ json: { success: true } });
  });
  await openShop(page);
  await page.getByRole("navigation", { name: "Разделы" }).getByRole("button", { name: "Корзина" }).click();
  await page.getByRole("button", { name: "К оформлению" }).click();
  await page.getByRole("combobox", { name: "Курьер" }).selectOption({ index: 1 });
  await page.getByRole("button", { name: "Подтвердить заказ" }).click();
  await expect(page.getByText("Заказ успешно оформлен!")).toBeVisible();
  await expect(page.getByText("ORD-TEST1")).toBeVisible();
  await expect(page.getByText("Telegram не принял заказ.")).toHaveCount(0);
  await expect(page.getByText("Сообщение курьеру ещё не доставлено. Заказ сохранён.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Написать курьеру/ })).toHaveAttribute("href", "https://t.me/courier_north");
  await expect(page.getByRole("button", { name: /Мои заказы/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /На главную/ })).toBeVisible();
  expect(creates).toBe(1);
  await page.getByRole("button", { name: /На главную/ }).click();
  await expect(page.getByText("Всё в одном месте")).toBeVisible();
  expect(creates).toBe(1);
});
