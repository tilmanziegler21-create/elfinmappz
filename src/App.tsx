import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { AdminScreen } from "./AdminScreen";
import { api, type ApiCourier, type AuthPhase, type Session, type SessionUser } from "./api";
import { bindTelegramViewport, resolveTelegramWebApp, telegramBotLink, telegramWebApp } from "./telegram";
import { BOOT_TIMEOUT_MS, bootPhase, bootProgress, WARM_KEY, type BootMarks } from "./boot";
import { ElfinSplash } from "./components/ElfinSplash";
import { CartScreen } from "./CartScreen";
import { Catalog } from "./CatalogScreen";
import { shopSection } from "./categoryRules";
import { CheckoutScreen } from "./CheckoutScreen";
import { CourierScreen } from "./CourierScreen";
import { OrdersScreen } from "./OrdersScreen";
import { CountBump } from "./CountBump";
import { ProductScreen } from "./ProductScreen";
import { catalogIdentity, lineTitle } from "./catalogLine";
import { mediaByBrand, mediaBySku } from "./productMedia";
import { CART_KEY, clampLineQty, defaultVariant, euro, findProduct, lineKey, products, quantityOffer, readLooseCart, sanitizeCart, setShelfPrices, setSheetCatalog, type Availability, type Product, type Variant } from "./products";
import { sectionItem, sectionList, tapSpring } from "./motion";
import { prewarmImages } from "./ImagePreloader";
import { languageName, languages, useI18n, type Lang } from "./i18n";
import { setNumberOf, setShot } from "./setCopy";
import { useTheme } from "./theme";

type Screen = "home" | "catalog" | "cart" | "orders" | "profile" | "checkout" | "courier" | "admin";

function readProductHash() {
  if (typeof window === "undefined") return null;
  return window.location.hash.match(/^#product\/([a-z0-9-]+)$/i)?.[1] ?? null;
}

function readProductOrigin(): Screen {
  if (typeof window === "undefined") return "home";
  const from = (window.history.state as { productFrom?: Screen } | null)?.productFrom;
  if (from === "home" || from === "catalog" || from === "cart" || from === "orders" || from === "profile") return from;
  return readProductHash() ? "catalog" : "home";
}
type Age = "pending" | "ok" | "denied";
type SheetRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  oldPrice?: number;
  stock: number;
  active: boolean;
  image?: string;
};

function flavorCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "вкус" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "вкуса" : "вкусов";
  return `${count} ${word}`;
}

function spotProducts(items: Product[]) {
  const text = (item: Product) => `${item.brand || ""} ${item.name} ${item.id}`.toUpperCase();
  const pick = (test: (value: string) => boolean) => items.find((item) => item.catalogImage && test(text(item)));
  return [
    pick((value) => value.includes("VOEX")),
    pick((value) => value.includes("PUFFY")),
    pick((value) => value.includes("XROS 6")),
  ].filter((item): item is Product => Boolean(item));
}

function productSlug(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "item";
}

function productFromRows(items: SheetRow[], name: string, image?: string, id?: string): Product {
  const flavors = items.map((row) => (row.name || "").trim());
  const variants: Variant[] = items.map((row) => {
    const closed = row.active === false || row.stock <= 0;
    const availability: Availability = closed ? "out" : row.stock <= 2 ? "low" : "in";
    const flavor = (row.name || row.sku).trim();
    const repeated = flavors.filter((item) => item === flavor).length > 1;
    return {
      id: row.sku || flavor,
      label: repeated ? `${flavor} · ${row.brand}` : flavor,
      price: row.price,
      oldPrice: row.oldPrice,
      availability,
      stock: closed ? 0 : row.stock,
    };
  }).sort((a, b) => a.label.localeCompare(b.label, "ru"));
  const open = variants.find((item) => item.availability !== "out" && item.stock > 0);
  const selling = variants.filter((item) => item.stock > 0);
  const stock = selling.reduce((sum, item) => sum + item.stock, 0);
  const identity = catalogIdentity(items[0].brand || "");
  return {
    id: id || productSlug(name),
    name,
    flavor: variants.length === 1 ? variants[0].label : flavorCount(variants.length),
    brand: identity.brand,
    productLine: identity.productLine || undefined,
    category: items[0].category,
    price: open?.price ?? variants[0]?.price ?? 0,
    oldPrice: open?.oldPrice ?? variants[0]?.oldPrice,
    availability: stock <= 0 ? "out" : selling.every((item) => item.stock <= 2) ? "low" : "in",
    featured: false,
    description: "",
    catalogImage: image,
    heroImage: image,
    variants,
  };
}

function uniqueNamedRows(items: SheetRow[]) {
  const byName = new Map<string, SheetRow>();
  for (const row of items) {
    const key = (row.name || row.sku).trim().toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, row);
      continue;
    }
    const currentOpen = current.active !== false && current.stock > 0;
    const nextOpen = row.active !== false && row.stock > 0;
    if (!currentOpen && nextOpen) byName.set(key, row);
  }
  return [...byName.values()];
}

function groupSheetRows(rows: SheetRow[]): Product[] {
  const groups = new Map<string, SheetRow[]>();
  for (const row of rows) {
    const identity = catalogIdentity(row.brand || "");
    const list = groups.get(identity.key) || [];
    list.push(row);
    groups.set(identity.key, list);
  }
  const grouped: Product[] = [];
  for (const items of groups.values()) {
    const identity = catalogIdentity(items[0].brand || "");
    const unique = uniqueNamedRows(items);
    const own = unique.filter((row) => mediaBySku(row.sku));
    const shared = unique.filter((row) => !mediaBySku(row.sku));
    for (const row of own) {
      const media = mediaBySku(row.sku);
      grouped.push(productFromRows([row], (row.name || identity.title).trim(), media?.image, row.sku.toLowerCase()));
    }
    if (shared.length) grouped.push(productFromRows(shared, identity.title, mediaByBrand(identity.title)?.image));
  }
  return grouped;
}

const AGE_KEY = "elfin-age";
const guestUser: SessionUser = { tgId: "", username: "", firstName: "", status: "customer" };

const screens: { id: Screen; label: string; icon: IconName }[] = [
  { id: "home", label: "Главная", icon: "home" },
  { id: "catalog", label: "Каталог", icon: "crystal" },
  { id: "cart", label: "Корзина", icon: "bag" },
  { id: "orders", label: "Заказы", icon: "list" },
  { id: "profile", label: "Профиль", icon: "user" },
];

const copy: Record<Screen, { kicker: string; title: string; lede?: string }> = {
  home: { kicker: "ELFIN MARKET", title: "ELFIN", lede: "Hamburg" },
  catalog: { kicker: "ELFIN Market", title: "Каталог" },
  cart: { kicker: "ELFIN Market", title: "Корзина" },
  checkout: { kicker: "ELFIN Market", title: "Оформление" },
  orders: { kicker: "ELFIN Market", title: "Заказы" },
  profile: { kicker: "ELFIN Market", title: "Профиль" },
  courier: { kicker: "ELFIN Market", title: "Курьер" },
  admin: { kicker: "ELFIN Market", title: "Админ" },
};

export function App() {
  const [age, setAge] = useState<Age>(() =>
    sessionStorage.getItem(AGE_KEY) === "ok" ? "ok" : "pending",
  );
  const [screen, setScreen] = useState<Screen>(readProductOrigin);
  const [productId, setProductId] = useState<string | null>(readProductHash);
  const [startQty, setStartQty] = useState(1);
  const catalogScroll = useRef(0);
  const opening = useRef<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>(readLooseCart);
  const [cartAdjusted, setCartAdjusted] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authPhase, setAuthPhase] = useState<AuthPhase>("initializing");
  const [payments, setPayments] = useState<string[]>(["cash"]);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [shopCity, setShopCity] = useState("HH");
  const [couriers, setCouriers] = useState<ApiCourier[]>([]);
  const [catalogMode, setCatalogMode] = useState<"loading" | "demo" | "live" | "error">("loading");
  const [liveProducts, setLiveProducts] = useState<Product[]>([]);
  const [bootNonce, setBootNonce] = useState(0);
  const [telegramReady, setTelegramReady] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [splashOn, setSplashOn] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutHeld, setCheckoutHeld] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const warmBoot = useRef(typeof sessionStorage !== "undefined" && sessionStorage.getItem(WARM_KEY) === "1");
  const marksRef = useRef<BootMarks>({ telegram: false, config: false, auth: false, catalog: false, images: false });
  const { t } = useI18n();
  const cartCount = useMemo(() => Object.values(cart).reduce((sum, count) => sum + count, 0), [cart]);
  const compact = age === "ok" && screen !== "home";
  const header = age === "ok" ? { ...copy[screen], title: screen === "home" ? "ELFIN" : t(`header.${screen}`) } : age === "denied"
    ? { kicker: "ELFIN Market", title: t("age.closedTitle"), lede: t("age.headerLede") }
    : { kicker: "ELFIN MARKET", title: "ELFIN", lede: t("age.pendingLede") };

  const view = productId ? "product" : screen;
  const scrolls = useRef<Partial<Record<Screen, number>>>({});
  const heldRef = useRef<Screen[]>(["home"]);
  if (age === "ok" && !heldRef.current.includes(screen)) heldRef.current = [...heldRef.current, screen];

  function settleCart() {
    setCart((current) => {
      const next = sanitizeCart(current);
      if (next.dropped) setCartAdjusted(true);
      return next.cart;
    });
  }

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const catalogReady = catalogMode === "demo" || catalogMode === "live";
  const marks: BootMarks = {
    telegram: telegramReady,
    config: configReady,
    auth: authReady,
    catalog: catalogReady,
    images: imagesReady,
  };
  marksRef.current = marks;
  const failed = bootFailed || catalogMode === "error";
  const phase = bootPhase(marks, failed);
  const progress = bootProgress(marks);

  useEffect(() => bindTelegramViewport(), []);

  useEffect(() => {
    let alive = true;
    setTelegramReady(false);
    setConfigReady(false);
    setAuthReady(false);
    setImagesReady(false);
    setBootFailed(false);
    setAuthPhase("initializing");
    const webApp = telegramWebApp();
    try {
      webApp?.ready?.();
      webApp?.expand?.();
    } catch {
      /* Telegram shell is optional in the browser. */
    }
    if (alive) setTelegramReady(true);
    const timer = window.setTimeout(() => {
      if (!alive) return;
      const current = marksRef.current;
      if (current.telegram && current.config && current.auth && current.catalog && current.images) return;
      setBootFailed(true);
    }, BOOT_TIMEOUT_MS);
    api<{ city: string; cityName?: string; devAuth: boolean; catalog?: string; payments?: string[]; botUsername?: string | null }>("/api/config")
      .then(async (config) => {
        if (!alive) return;
        setConfigReady(true);
        setShopCity(config.city || "HH");
        setPayments(Array.isArray(config.payments) && config.payments.length > 0 ? config.payments : ["cash"]);
        setBotUrl(telegramBotLink(config.botUsername));
        if (config.catalog === "demo") {
          setSheetCatalog([]);
          setShelfPrices(false);
          settleCart();
          setCatalogMode("demo");
        } else setCatalogMode("loading");
        const webApp = await resolveTelegramWebApp();
        try {
          webApp?.ready?.();
          webApp?.expand?.();
        } catch {
          /* Telegram shell is optional in the browser. */
        }
        const initData = String(webApp?.initData || "").trim();
        if (initData) {
          try {
            const next = await api<Session>("/api/auth/telegram", { method: "POST", body: { initData } });
            if (!alive) return;
            setSession({ ...next, dev: false, city: config.city });
            setAuthError(null);
            setAuthPhase("authenticated");
          } catch (reason) {
            if (!alive) return;
            const message = reason instanceof Error ? reason.message : "";
            setSession(null);
            setAuthPhase(message === "Expired initData" ? "expired" : "error");
            setAuthError(t("checkout.auth"));
          }
          if (alive) setAuthReady(true);
          return;
        }
        if (!config.devAuth) {
          setSession(null);
          setAuthPhase("unauthenticated");
          setAuthReady(true);
          return;
        }
        const saved = localStorage.getItem("elfin-dev-user") || "123456789";
        const next = await api<Session>("/api/auth/dev", { method: "POST", body: { tgId: saved } });
        if (!alive) return;
        setSession({ ...next, city: config.city });
        setAuthPhase("authenticated");
        setAuthReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setCatalogMode("error");
        setBootFailed(true);
      });
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [bootNonce]);

  useEffect(() => {
    if (!catalogReady) return;
    let alive = true;
    const shelf = catalogMode === "demo"
      ? products.filter((item) => shopSection(item.category)).slice(0, 4)
      : liveProducts.slice(0, 4);
    const urls = ["/elf.jpg", ...shelf.map((item) => item.catalogImage)];
    prewarmImages(urls, 2).then(() => {
      if (alive) setImagesReady(true);
    });
    return () => {
      alive = false;
    };
  }, [catalogReady, catalogMode, liveProducts, bootNonce]);

  useEffect(() => {
    if (!session) return;
    const open = () => {
      const hash = window.location.hash;
      if (hash === "#/courier" && (session.user.status === "courier" || session.user.status === "admin")) setScreen("courier");
      if (hash === "#/admin" && session.user.status === "admin") setScreen("admin");
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [session]);

  useEffect(() => {
    if (!configReady || catalogMode === "error") return;
    let alive = true;
    if (catalogMode === "loading") {
      api<{ source?: string; products?: SheetRow[]; liquidPrices?: unknown }>(`/api/catalog?city=${encodeURIComponent(shopCity)}`, { token: session?.token })
        .then((data) => {
          if (!alive) return;
          if (data.source !== "sheets" || !Array.isArray(data.products)) {
            setShelfPrices(false);
            setCatalogMode("error");
            return;
          }
          const grouped = groupSheetRows(data.products);
          setSheetCatalog(grouped);
          setShelfPrices(true);
          setLiveProducts(grouped);
          settleCart();
          setCatalogMode("live");
        })
        .catch(() => {
          if (alive) {
            setShelfPrices(false);
            setCatalogMode("error");
          }
        });
    }
    api<{ couriers?: ApiCourier[] }>(`/api/couriers?city=${encodeURIComponent(shopCity)}`, { token: session?.token })
      .then((data) => {
        if (alive) setCouriers(Array.isArray(data.couriers) ? data.couriers : []);
      })
      .catch(() => {
        if (alive) setCouriers([]);
      });
    return () => {
      alive = false;
    };
  }, [configReady, catalogMode, shopCity, session?.token]);

  useEffect(() => {
    const read = () => {
      const id = readProductHash();
      setProductId(id);
      if (!id) return;
      const from = (window.history.state as { productFrom?: Screen } | null)?.productFrom;
      if (from === "home" || from === "catalog" || from === "cart" || from === "orders" || from === "profile") setScreen(from);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  useLayoutEffect(() => {
    opening.current = productId;
  }, [productId]);

  useLayoutEffect(() => {
    if (productId) return;
    const body = document.querySelector(".body");
    if (!(body instanceof HTMLElement)) return;
    const next = scrolls.current[screen];
    if (typeof next === "number") body.scrollTop = next;
  }, [productId, screen]);

  useEffect(() => {
    if (productId || screen !== "catalog") return;
    const body = document.querySelector(".body");
    if (!(body instanceof HTMLElement)) return;
    const apply = () => {
      if (!body.querySelector(".catalog-tools")) return;
      body.scrollTop = catalogScroll.current;
      observer.disconnect();
    };
    const observer = new MutationObserver(apply);
    observer.observe(body, { childList: true, subtree: true });
    apply();
    return () => observer.disconnect();
  }, [productId, screen]);

  function openProduct(id: string, qty = 1) {
    setStartQty(Math.max(1, Math.floor(qty) || 1));
    if (productId === id || opening.current === id) return;
    opening.current = id;
    const body = document.querySelector(".body");
    if (body instanceof HTMLElement) {
      scrolls.current[screen] = body.scrollTop;
      if (screen === "catalog") catalogScroll.current = body.scrollTop;
    }
    setProductId(id);
    window.history.pushState({ productFrom: screen }, "", `#product/${id}`);
  }

  function showScreen(next: Screen) {
    const body = document.querySelector(".body");
    if (body instanceof HTMLElement && !productId) scrolls.current[screen] = body.scrollTop;
    setCheckoutOpen(false);
    setScreen(next);
  }

  function closeProduct() {
    opening.current = null;
    setProductId(null);
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  const cartRef = useRef(cart);
  cartRef.current = cart;

  function addToCart(productIdToAdd: string, qty = 1, variantId?: string): "added" | "limit" | "unavailable" {
    const product = findProduct(productIdToAdd);
    const variant = product?.variants.find((item) => item.id === variantId) ?? (product ? defaultVariant(product) : null);
    if (!product || !variant || variant.availability === "out" || variant.stock <= 0) return "unavailable";
    const key = lineKey(product.id, variant.id);
    const have = cartRef.current[key] ?? 0;
    const room = variant.stock - have;
    if (room <= 0) return "limit";
    const next = { ...cartRef.current, [key]: have + Math.min(qty, room) };
    cartRef.current = next;
    setCart(next);
    return "added";
  }

  function changeQty(key: string, qty: number) {
    const next = clampLineQty(key, qty);
    if (!next) return;
    setCart((current) => (current[key] === next ? current : { ...current, [key]: next }));
  }

  function removeLine(key: string) {
    setCart((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function restoreLine(key: string, qty: number) {
    const next = clampLineQty(key, qty);
    if (!next) return;
    setCart((current) => (current[key] ? current : { ...current, [key]: next }));
  }

  useEffect(() => {
    if (!bootFailed || catalogMode === "error") return;
    if (telegramReady && configReady && authReady && catalogReady && imagesReady) setBootFailed(false);
  }, [bootFailed, catalogMode, telegramReady, configReady, authReady, catalogReady, imagesReady]);

  const dismissSplash = useCallback(() => {
    sessionStorage.setItem(WARM_KEY, "1");
    setSplashOn(false);
  }, []);

  const retryBoot = useCallback(() => {
    setSession(null);
    setCatalogMode("loading");
    setBootNonce((value) => value + 1);
  }, []);

  function allow() {
    sessionStorage.setItem(AGE_KEY, "ok");
    setAge("ok");
    setScreen("home");
  }

  return (
    <div className="stage" data-compact={compact ? "true" : "false"} data-nav={age === "ok" ? "true" : "false"} data-product={productId ? "true" : "false"} data-checkout={checkoutOpen ? "true" : "false"} data-catalog={view === "catalog" ? "true" : "false"} data-home={view === "home" ? "true" : "false"}>
      <Atmosphere />
      <header className="toprow">
        <ElfMedallion />
        <div className="titles">
          <p className="kicker">{header.kicker}</p>
          <h1 className="brand-mark" data-long={header.title.length > 6 ? "true" : "false"}>
            {header.title}
          </h1>
          {header.lede ? <p className="lede">{header.lede}</p> : null}
        </div>
      </header>

      <div className="body">
        {age !== "ok" ? (
          <section className="panel">
            {age === "pending" ? (
              <>
                <p className="panel-text">
                  {t("age.text")}
                </p>
                <Press className="btn btn-primary" onClick={allow}>
                  {t("age.yes")}
                </Press>
                <Press className="btn btn-ghost" onClick={() => setAge("denied")}>
                  {t("age.no")}
                </Press>
              </>
            ) : (
              <>
                <p className="panel-text">
                  {t("age.closed")}
                </p>
                <Press className="btn btn-ghost" onClick={() => setAge("pending")}>
                  {t("age.back")}
                </Press>
              </>
            )}
          </section>
        ) : (
          <>
            {heldRef.current.includes("home") ? (
              <section className={view === "home" ? "panel panel-home is-current" : "panel panel-home"} hidden={view !== "home"}>
                <Home
                  onOpen={showScreen}
                  onProduct={openProduct}
                  shelf={catalogMode === "live" ? liveProducts.filter((item) => shopSection(item.category) !== "Наборы").slice(0, 4) : []}
                  spots={catalogMode === "live" ? spotProducts(liveProducts) : []}
                  liquids={catalogMode === "live" ? liveProducts.filter((item) => item.category.trim().toLowerCase() === "liquids" || item.category.trim().toLowerCase() === "liquids1") : []}
                  live={catalogMode === "live"}
                />
              </section>
            ) : null}
            {heldRef.current.includes("catalog") ? (
              <section className={view === "catalog" ? "panel panel-home is-current" : "panel panel-home"} hidden={view !== "catalog"}>
                <Catalog
                  mode={catalogMode}
                  items={liveProducts}
                  cart={cart}
                  onAdd={addToCart}
                  onOpen={openProduct}
                  onRefresh={() => setCatalogMode("loading")}
                />
              </section>
            ) : null}
            {heldRef.current.includes("cart") ? (
              <section className={view === "cart" ? "panel panel-cart is-current" : "panel panel-cart"} hidden={view !== "cart"}>
                <CartScreen
                  cart={cart}
                  adjusted={cartAdjusted}
                  onQty={changeQty}
                  onRemove={removeLine}
                  onRestore={restoreLine}
                  onOpen={openProduct}
                  onCatalog={() => showScreen("catalog")}
                  onContinue={() => { setCheckoutHeld(true); setCheckoutOpen(true); }}
                />
              </section>
            ) : null}
            {heldRef.current.includes("orders") ? (
              <section className={view === "orders" ? "panel panel-cart is-current" : "panel panel-cart"} hidden={view !== "orders"}>
                {session ? <OrdersScreen token={session.token} city={session.city} couriers={couriers} botUrl={botUrl} onCatalog={() => showScreen("catalog")} /> : <p className="empty-text">{authPhase === "initializing" ? t("checkout.checking") : t("orders.needAuth")}</p>}
              </section>
            ) : null}
            {heldRef.current.includes("profile") ? (
              <section className={view === "profile" ? "panel panel-home is-current" : "panel panel-home"} hidden={view !== "profile"}>
                <Profile
                  session={session}
                  authPhase={authPhase}
                  authError={authError}
                  onCourier={() => {
                    if (session && (session.user.status === "courier" || session.user.status === "admin")) {
                      window.location.hash = "#/courier";
                      showScreen("courier");
                    }
                  }}
                  onAdmin={() => {
                    if (session?.user.status === "admin") {
                      window.location.hash = "#/admin";
                      showScreen("admin");
                    }
                  }}
                  roleError={roleError}
                  onRole={async (tgId) => {
                    localStorage.setItem("elfin-dev-user", tgId);
                    try {
                      const next = await api<Session>("/api/auth/dev", { method: "POST", body: { tgId } });
                      setSession({ ...next, city: session?.city || next.city });
                      setRoleError(null);
                      showScreen("profile");
                    } catch (reason) {
                      setRoleError(reason instanceof Error ? reason.message : "Ошибка запроса");
                    }
                  }}
                />
              </section>
            ) : null}
            {heldRef.current.includes("courier") && session && (session.user.status === "courier" || session.user.status === "admin") ? (
              <section className={view === "courier" ? "panel panel-cart is-current" : "panel panel-cart"} hidden={view !== "courier"}>
                <CourierScreen token={session.token} city={session.city} />
              </section>
            ) : null}
            {heldRef.current.includes("admin") && session?.user.status === "admin" ? (
              <section className={view === "admin" ? "panel panel-cart is-current" : "panel panel-cart"} hidden={view !== "admin"}>
                <AdminScreen token={session.token} city={session.city} />
              </section>
            ) : null}
            {productId ? (
              <ProductScreen productId={productId} startQty={startQty} cart={cart} onBack={closeProduct} onAdd={addToCart} onCart={() => { closeProduct(); showScreen("cart"); }} />
            ) : null}
          </>
        )}
      </div>

      {age === "ok" ? (
          <nav className="nav" aria-label={t("nav.label")} inert={checkoutOpen ? true : undefined}>
            {screens.map((item) => {
              const active = item.id === screen || (screen === "checkout" && item.id === "cart") || ((screen === "courier" || screen === "admin") && item.id === "profile");
              return (
                <Press
                  key={item.id}
                  className={active ? "nav-btn is-active" : "nav-btn"}
                  current={active}
                  onClick={() => {
                    const hash = window.location.hash;
                    if (hash === "#/courier" || hash === "#/admin" || hash.startsWith("#product/")) {
                      window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
                    }
                    if (productId) {
                      opening.current = null;
                      setProductId(null);
                    }
                    showScreen(item.id);
                  }}
                >
                  {active ? <span className="nav-pill" /> : null}
                  <Icon name={item.icon} />
                  <span>{t(`nav.${item.id}`)}</span>
                  {item.id === "cart" && cartCount > 0 ? <CountBump className="nav-badge" value={cartCount} label={t("home.cartCount", { count: cartCount })} /> : null}
                </Press>
              );
            })}
          </nav>
        ) : null}
      {checkoutHeld ? (
        <div className={checkoutOpen ? "sheet-layer is-open" : "sheet-layer"} aria-hidden={!checkoutOpen} inert={!checkoutOpen ? true : undefined}>
          <button type="button" className="sheet-scrim" aria-label={t("checkout.closeSheet")} onClick={() => setCheckoutOpen(false)} />
          <div className="sheet-panel" role="dialog" aria-label={t("checkout.title")}>
            <CheckoutScreen
              cart={cart}
              token={session?.token ?? ""}
              city={session?.city || shopCity}
              user={session?.user ?? guestUser}
              verified={Boolean(session && !session.dev && session.user.tgId)}
              authPhase={authPhase}
              payments={payments}
              botUrl={botUrl}
              couriers={couriers}
              onClearCart={() => setCart({})}
              onCatalog={() => showScreen("catalog")}
              onHome={() => showScreen("home")}
              onOrders={() => showScreen("orders")}
              onClose={() => setCheckoutOpen(false)}
              authFailed={Boolean(authError)}
            />
          </div>
        </div>
      ) : null}
      {splashOn ? (
        <ElfinSplash
          phase={phase}
          progress={progress}
          warm={warmBoot.current}
          onRetry={retryBoot}
          onHidden={dismissSplash}
        />
      ) : null}
    </div>
  );
}

function Press({
  className,
  onClick,
  current,
  children,
}: {
  className: string;
  onClick: () => void;
  current?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={className}
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={tapSpring}
    >
      {children}
    </motion.button>
  );
}

function Home({
  onOpen,
  onProduct,
  shelf,
  spots,
  liquids,
  live,
}: {
  onOpen: (screen: Screen) => void;
  onProduct: (id: string, qty?: number) => void;
  shelf: Product[];
  spots: Product[];
  liquids: Product[];
  live: boolean;
}) {
  const reduce = useReducedMotion();
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [terms, setTerms] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [focus, setFocus] = useState<"home" | "hits">("home");
  const tools = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!langOpen) return;
    const close = (event: PointerEvent) => {
      if (!tools.current?.contains(event.target as Node)) setLangOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLangOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [langOpen]);
  const cards = live ? shelf : products.filter((item) => shopSection(item.category)).slice(0, 4);
  const hits = liquids.flatMap((item) => {
    const offer = quantityOffer(item.category);
    if (!offer) return [];
    return offer.steps
      .filter((step) => !step.talk && step.qty >= 2 && step.save > 0 && item.variants.some((variant) => variant.stock >= step.qty))
      .map((step) => ({ id: `${item.id}-${step.qty}`, item, step }));
  });
  const stage = typeof document !== "undefined" ? document.querySelector(".stage") : null;
  return (
    <motion.div
      className="home"
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={sectionList}
    >
      <motion.div className="catalog-bar home-bar" variants={sectionItem}>
        <img className="catalog-elf" src="/elf.jpg" alt="" />
        <div className="home-brand">
          <p className="catalog-word">ELFIN Market</p>
          <p className="home-city">Hamburg</p>
        </div>
        <div className="home-tools" ref={tools}>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <SunMark /> : <MoonMark />}
          </button>
          <button
            type="button"
            className="lang-toggle"
            aria-label={`${t("profile.language")}, ${lang.toUpperCase()}`}
            aria-expanded={langOpen}
            onClick={() => setLangOpen((open) => !open)}
          >
            <GlobeMark />
            {lang.toUpperCase()}
          </button>
          {langOpen ? (
            <div className="lang-pop" role="listbox" aria-label={t("profile.languageTitle")}>
              {languages.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="option"
                  className={item === lang ? "is-on" : ""}
                  aria-selected={item === lang}
                  onClick={() => { setLang(item); setLangOpen(false); }}
                >
                  <span>{item === "ru" ? "🇷🇺" : item === "uk" ? "🇺🇦" : item === "en" ? "🇬🇧" : "🇩🇪"} {languageName[item]}</span>
                  <strong>{item.toUpperCase()}</strong>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </motion.div>
      {focus === "home" ? (
        <button type="button" className="home-jump" onClick={() => onOpen("catalog")}>{t("home.all")}</button>
      ) : null}
      {focus === "home" && spots.length > 0 ? (
        <div className="home-spots">
          {spots.map((item, index) => (
            <button key={item.id} type="button" className="spot-card" onClick={() => onProduct(item.id)}>
              <span className="spot-art"><img src={item.catalogImage} alt="" /></span>
              <span className="spot-copy">
                <strong>{t(index === 0 ? "home.spotlightNew" : index === 1 ? "home.spotlightPopular" : "home.spotlightBack")}</strong>
                <em>{lineTitle(item)}</em>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {focus === "home" ? (
        <motion.div className="home-promos" variants={sectionItem}>
          <article className="promo-shot">
            <img src={`/assets/home/promo/place-${theme}.jpg`} alt="" />
            <h2>{t("home.together")}</h2>
            <button type="button" onClick={() => onOpen("catalog")}>{t("home.promoWatch")}</button>
          </article>
          <article className="promo-shot">
            <img src={`/assets/home/promo/discount-${theme}.jpg`} alt="" />
            <h2>{t("home.discountTitle")}</h2>
            <button type="button" onClick={() => setTerms(true)}>{t("home.discountAction")}</button>
          </article>
          <article className="promo-shot">
            <img src={`/assets/home/promo/bonus-${theme}.jpg`} alt="" />
            <h2>{t("home.bonusTitle")}</h2>
            <button type="button" onClick={() => onOpen("profile")}>{t("home.bonusAction")}</button>
          </article>
          <article className="promo-shot">
            <img src={`/assets/home/promo/invite-${theme}.jpg`} alt="" />
            <h2>{t("home.inviteTitle")}</h2>
            <button type="button" onClick={() => onOpen("profile")}>{t("home.inviteAction")}</button>
          </article>
        </motion.div>
      ) : null}
      {focus !== "home" ? (
        <div className="home-focus-bar">
          <button type="button" className="home-back" onClick={() => setFocus("home")}>{t("home.back")}</button>
          <h2>{t("home.deals")}</h2>
        </div>
      ) : null}
      {hits.length > 0 && focus === "hits" ? (
        <motion.div className="catalog home-vitrine" variants={sectionItem}>
          <div className="hit-list">
            {hits.map((hit) => (
              <button key={hit.id} type="button" className="hit-card" onClick={() => onProduct(hit.item.id, hit.step.qty)}>
                <HomeArt item={hit.item} theme={theme} />
                <span className="hit-copy">
                  <span className="product-name">{hit.step.qty} {lineTitle(hit.item)}</span>
                  <span className="product-flavor">{hit.item.flavor}</span>
                  <span className="product-price">
                    {hit.step.full > hit.step.total ? <s>{euro(hit.step.full)}</s> : null}
                    <strong>{euro(hit.step.total)}</strong>
                  </span>
                </span>
                <em className="hit-save">{t("home.save", { sum: euro(hit.step.save) })}</em>
              </button>
            ))}
          </div>
        </motion.div>
      ) : null}
      {focus === "home" ? (
      <motion.div className="catalog home-vitrine" variants={sectionItem}>
        <div className="home-shelf-head">
          <h2>{t("home.catalog")} {live ? null : <span className="home-demo">{t("home.demo")}</span>}</h2>
          <button type="button" className="home-all" onClick={() => onOpen("catalog")}>{t("home.all")}</button>
        </div>
        <div className="shelf">
          {cards.map((item) => (
            <button key={item.id} type="button" className="product home-card" data-kind={setNumberOf(item) ? "set" : undefined} onClick={() => onProduct(item.id)}>
              <HomeArt item={item} theme={theme} />
              <span className="product-name">{lineTitle(item)}</span>
              <span className="product-flavor">{item.flavor}</span>
              <span className="product-price"><strong>{live ? euro(item.price) : "—"}</strong></span>
            </button>
          ))}
        </div>
      </motion.div>
      ) : null}
      {terms && stage
        ? createPortal(
            <div className="terms-layer">
              <button type="button" className="terms-scrim" aria-label={t("terms.dismiss")} onClick={() => setTerms(false)} />
              <div className="terms-card" role="dialog" aria-labelledby="home-terms-title">
                <h2 id="home-terms-title">{t("terms.title")}</h2>
                <p>{t("terms.body")}</p>
                <button type="button" className="terms-close" onClick={() => setTerms(false)}>{t("terms.close")}</button>
              </div>
            </div>,
            stage,
          )
        : null}
    </motion.div>
  );
}

function SunMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  );
}

function MoonMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M16 3.2A8 8 0 1 0 20.8 14 6.2 6.2 0 0 1 16 3.2z" />
    </svg>
  );
}

function GlobeMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.2 2.4 2.2 13.6 0 16M12 4c-2.2 2.4-2.2 13.6 0 16" />
    </svg>
  );
}

function HomeArt({ item, theme }: { item: Product; theme: "light" | "dark" }) {
  const { t } = useI18n();
  const number = setNumberOf(item);
  const src = number ? setShot(number, theme) : item.catalogImage;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setFailed(false);
    const node = image.current;
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, [src]);
  if (!src || failed) {
    return (
      <span className="product-art">
        <span className="mark-fallback">
          <span className="mark" aria-hidden="true" />
          <span className="mark-note">{t("home.noPhoto")}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="product-art">
      <img
        ref={image}
        className={loaded ? "product-photo is-in" : "product-photo"}
        src={src}
        alt=""
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function Profile({
  session,
  authPhase,
  authError,
  onCourier,
  onAdmin,
  onRole,
  roleError,
}: {
  session: Session | null;
  authPhase: AuthPhase;
  authError?: string | null;
  onCourier: () => void;
  onAdmin: () => void;
  onRole: (tgId: string) => void;
  roleError?: string | null;
}) {
  const { t, lang, setLang } = useI18n();
  const [langOpen, setLangOpen] = useState(false);
  const verified = Boolean(session && !session.dev && session.user.tgId);
  const facts = [
    [t("profile.age"), t("profile.ageValue")],
    [t("profile.city"), "Hamburg"],
    [t("profile.role"), session?.user.status || t("profile.noSession")],
    [t("profile.entry"), authPhase === "initializing" ? t("profile.checking") : verified ? "Telegram" : session?.dev ? t("profile.test") : t("profile.none")],
  ];
  if (verified && session) {
    const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ");
    facts.push(
      [t("profile.name"), name || t("profile.noName")],
      [t("profile.username"), session.user.username ? `@${session.user.username}` : t("profile.noUsername")],
      ["Telegram ID", session.user.tgId],
    );
  }
  const staff = session?.user.status === "courier" || session?.user.status === "admin";
  const stage = typeof document !== "undefined" ? document.querySelector(".stage") : null;

  return (
    <div className="facts">
      <button type="button" className="lang-entry" onClick={() => setLangOpen(true)}>
        <span>🌐 {t("profile.languageTitle")}</span>
        <strong>{languageName[lang]}</strong>
      </button>
      {facts.map(([label, value]) => (
        <div key={label} className="fact">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {staff ? <Press className="btn btn-ghost" onClick={onCourier}>{t("profile.courier")}</Press> : null}
      {session?.user.status === "admin" ? <Press className="btn btn-ghost" onClick={onAdmin}>{t("profile.admin")}</Press> : null}
      {authError ? <p className="checkout-error" role="alert">{authError}</p> : null}
      {roleError ? <p className="checkout-error" role="alert">{roleError}</p> : null}
      {session?.dev ? (
        <div className="choice-row">
          <button type="button" className="choice" onClick={() => onRole("123456789")}>{t("profile.customer")}</button>
          <button type="button" className="choice" onClick={() => onRole("100000001")}>Север</button>
          <button type="button" className="choice" onClick={() => onRole("100000002")}>Иней</button>
          <button type="button" className="choice" onClick={() => onRole("100000009")}>{t("header.admin")}</button>
        </div>
      ) : null}
      {langOpen && stage
        ? createPortal(
            <div className="sheet-layer is-open">
              <button type="button" className="sheet-scrim" aria-label={t("terms.close")} onClick={() => setLangOpen(false)} />
              <div className="sheet-panel lang-sheet" role="dialog" aria-label={t("profile.languageTitle")}>
                <div className="sheet-head">
                  <span className="sheet-grip" aria-hidden="true" />
                  <button type="button" className="sheet-close" onClick={() => setLangOpen(false)}>{t("terms.close")}</button>
                </div>
                <div className="sheet-list">
                  {languages.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={item === lang ? "lang-option is-on" : "lang-option"}
                      aria-pressed={item === lang}
                      onClick={() => { setLang(item as Lang); setLangOpen(false); }}
                    >
                      <span>{item === "ru" ? "🇷🇺" : item === "uk" ? "🇺🇦" : item === "en" ? "🇬🇧" : "🇩🇪"} {languageName[item]}</span>
                      <strong>{item.toUpperCase()}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            stage,
          )
        : null}
    </div>
  );
}

function ElfMedallion() {
  return (
    <div className="elf-stage">
      <div className="elf-float">
        <span className="elf-glow" />
        <span className="ring ring-b" />
        <span className="ring ring-a" />
        <img src="/elf.jpg" alt="ELFIN" />
        <span className="elf-hair" aria-hidden="true" />
        <span className="lid lid-l" aria-hidden="true" />
        <span className="lid lid-r" aria-hidden="true" />
        <span className="mist" />
      </div>
    </div>
  );
}

function Atmosphere() {
  return (
    <div className="atmosphere" aria-hidden="true">
      <span className="shimmer" />
      <span className="haze haze-a" />
      <span className="haze haze-b" />
      <span className="gem gem-a" />
      <span className="gem gem-b" />
      <span className="gem gem-c" />
      <span className="gem gem-d" />
      <span className="gem gem-e" />
    </div>
  );
}

type IconName = "home" | "crystal" | "bag" | "list" | "user" | "chevron";

function Icon({ name }: { name: IconName }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "home") {
    return (
      <svg {...props}>
        <path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5.2v-6.2H10.2V21H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === "crystal") {
    return (
      <svg {...props}>
        <path d="M12 2.8 20 8.2 12 21.2 4 8.2z" />
        <path d="M4 8.2h16" />
        <path d="M12 2.8 9.2 8.2 12 21.2 14.8 8.2z" />
      </svg>
    );
  }
  if (name === "bag") {
    return (
      <svg {...props}>
        <circle cx="9" cy="19.2" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="17" cy="19.2" r="1.15" fill="currentColor" stroke="none" />
        <path d="M4 5.2h2.1l1.5 9.1a1 1 0 0 0 1 .8h8.7a1 1 0 0 0 1-.8L20 8H7.2" />
      </svg>
    );
  }
  if (name === "list") {
    return (
      <svg {...props}>
        <path d="M8 7h11" />
        <path d="M8 12h11" />
        <path d="M8 17h11" />
        <path d="M4.5 7h.01" />
        <path d="M4.5 12h.01" />
        <path d="M4.5 17h.01" />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.1" />
        <path d="M5.4 19.2a6.6 6.6 0 0 1 13.2 0" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M9 5.5 15.5 12 9 18.5" />
    </svg>
  );
}
