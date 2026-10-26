import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AdminScreen } from "./AdminScreen";
import { api, type ApiCourier, type Session } from "./api";
import { BOOT_TIMEOUT_MS, bootPhase, bootProgress, WARM_KEY, type BootMarks } from "./boot";
import { ElfinSplash } from "./components/ElfinSplash";
import { CartScreen } from "./CartScreen";
import { Catalog } from "./CatalogScreen";
import { shopSection } from "./categoryRules";
import { CheckoutScreen } from "./CheckoutScreen";
import { LoyaltyProgress } from "./LoyaltyProgress";
import { CourierScreen } from "./CourierScreen";
import { OrdersScreen } from "./OrdersScreen";
import { CountBump } from "./CountBump";
import { ProductScreen } from "./ProductScreen";
import { navIndicator } from "./productMotion";
import { mediaBySku } from "./productMedia";
import { CART_KEY, clampLineQty, defaultVariant, findProduct, lineKey, products, readStoredCart, type Availability, type Product } from "./products";
import { ease, pageMove, sectionItem, sectionList, tapSpring } from "./motion";
import { prewarmImages } from "./ImagePreloader";

type Screen = "home" | "catalog" | "cart" | "orders" | "profile" | "checkout" | "courier" | "admin";
type Age = "pending" | "ok" | "denied";
type SheetRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  active: boolean;
  image?: string;
};

function sheetToProduct(row: SheetRow): Product {
  const closed = row.active === false || row.stock <= 0;
  const availability: Availability = closed ? "out" : row.stock <= 2 ? "low" : "in";
  const media = mediaBySku(row.sku);
  const image = media?.image || row.image || undefined;
  return {
    id: row.sku || row.id,
    name: row.brand || row.name,
    flavor: row.name,
    brand: row.brand,
    category: row.category,
    price: row.price,
    availability,
    featured: false,
    description: "",
    catalogImage: image,
    heroImage: image,
    variants: [{ id: row.sku || "1", label: "1", price: row.price, availability, stock: closed ? 0 : row.stock }],
  };
}

const AGE_KEY = "elfin-age";

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
  const reduce = useReducedMotion();
  const [age, setAge] = useState<Age>(() =>
    sessionStorage.getItem(AGE_KEY) === "ok" ? "ok" : "pending",
  );
  const [screen, setScreen] = useState<Screen>("home");
  const [productId, setProductId] = useState<string | null>(null);
  const [boot] = useState(readStoredCart);
  const [cart, setCart] = useState<Record<string, number>>(boot.cart);
  const [cartAdjusted] = useState(boot.dropped);
  const [session, setSession] = useState<Session | null>(null);
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
  const warmBoot = useRef(typeof sessionStorage !== "undefined" && sessionStorage.getItem(WARM_KEY) === "1");
  const marksRef = useRef<BootMarks>({ telegram: false, config: false, auth: false, catalog: false, images: false });
  const cartCount = useMemo(() => Object.values(cart).reduce((sum, count) => sum + count, 0), [cart]);
  const compact = age === "ok" && screen !== "home";
  const header = age === "ok" ? copy[screen] : age === "denied"
    ? { kicker: "ELFIN Market", title: "Закрыто", lede: "Только с 18 лет" }
    : { kicker: "ELFIN MARKET", title: "ELFIN", lede: "Подтвердите возраст" };

  const soft = reduce ? { initial: false as const } : pageMove;

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

  useEffect(() => {
    let alive = true;
    setTelegramReady(false);
    setConfigReady(false);
    setAuthReady(false);
    setImagesReady(false);
    setBootFailed(false);
    const webApp = (window as unknown as { Telegram?: { WebApp?: { ready?: () => void; initData?: string } } }).Telegram?.WebApp;
    try {
      webApp?.ready?.();
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
    api<{ city: string; cityName?: string; devAuth: boolean; catalog?: string }>("/api/config")
      .then(async (config) => {
        if (!alive) return;
        setConfigReady(true);
        setCatalogMode(config.catalog === "demo" ? "demo" : "loading");
        const initData = webApp?.initData;
        if (initData) {
          const next = await api<Session>("/api/auth/telegram", { method: "POST", body: { initData } });
          if (!alive) return;
          setSession({ ...next, city: config.city });
          setAuthReady(true);
          return;
        }
        if (!config.devAuth) {
          setAuthReady(true);
          return;
        }
        const saved = localStorage.getItem("elfin-dev-user") || "123456789";
        const next = await api<Session>("/api/auth/dev", { method: "POST", body: { tgId: saved } });
        if (!alive) return;
        setSession({ ...next, city: config.city });
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
    let alive = true;
    if (catalogMode === "loading") {
      api<{ source?: string; products?: SheetRow[] }>(`/api/catalog?city=${encodeURIComponent(session.city)}`, { token: session.token })
        .then((data) => {
          if (!alive) return;
          if (data.source !== "sheets" || !Array.isArray(data.products)) {
            setCatalogMode("error");
            return;
          }
          setLiveProducts(data.products.map(sheetToProduct));
          setCatalogMode("live");
        })
        .catch(() => {
          if (alive) setCatalogMode("error");
        });
    }
    api<{ couriers: ApiCourier[] }>(`/api/couriers?city=${encodeURIComponent(session.city)}`, { token: session.token })
      .then((data) => {
        if (alive) setCouriers(catalogMode === "demo" && data.couriers ? data.couriers : []);
      })
      .catch(() => {
        if (alive) setCouriers([]);
      });
    return () => {
      alive = false;
      window.removeEventListener("hashchange", open);
    };
  }, [session, catalogMode]);

  useEffect(() => {
    const read = () => {
      const id = window.location.hash.match(/^#product\/([a-z0-9-]+)$/i)?.[1] ?? null;
      setProductId(id);
      if (id) setScreen("catalog");
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("popstate", read);
    };
  }, []);

  function openProduct(id: string) {
    setScreen("catalog");
    setProductId(id);
    window.history.pushState(null, "", `#product/${id}`);
  }

  function closeProduct() {
    setProductId(null);
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  function addToCart(productIdToAdd: string, qty = 1, variantId?: string): "added" | "limit" | "unavailable" {
    const product = findProduct(productIdToAdd);
    const variant = product?.variants.find((item) => item.id === variantId) ?? (product ? defaultVariant(product) : null);
    if (!product || !variant || variant.availability === "out" || variant.stock <= 0) return "unavailable";
    const key = lineKey(product.id, variant.id);
    let status: "added" | "limit" = "limit";
    setCart((current) => {
      const have = current[key] ?? 0;
      const room = variant.stock - have;
      if (room <= 0) return current;
      status = "added";
      return { ...current, [key]: have + Math.min(qty, room) };
    });
    return status;
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
    <div className="stage" data-compact={compact ? "true" : "false"} data-nav={age === "ok" && !productId ? "true" : "false"} data-product={productId ? "true" : "false"} data-catalog={screen === "catalog" && !productId ? "true" : "false"} data-home={screen === "home" ? "true" : "false"}>
      <Atmosphere />
      <header className="toprow">
        <ElfMedallion />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={age === "ok" ? screen : age}
            className="titles"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            <p className="kicker">{header.kicker}</p>
            <h1 className="brand-mark" data-long={header.title.length > 6 ? "true" : "false"}>
              {header.title}
            </h1>
            {header.lede ? <p className="lede">{header.lede}</p> : null}
          </motion.div>
        </AnimatePresence>
      </header>

      <div className="body">
        <AnimatePresence mode="wait" initial={false}>
          {age !== "ok" ? (
            <motion.section key={age} className="panel" {...soft}>
              {age === "pending" ? (
                <>
                  <p className="panel-text">
                    Магазин доступен только лицам старше 18 лет.
                  </p>
                  <Press className="btn btn-primary" onClick={allow}>
                    Мне есть 18
                  </Press>
                  <Press className="btn btn-ghost" onClick={() => setAge("denied")}>
                    Мне нет 18
                  </Press>
                </>
              ) : (
                <>
                  <p className="panel-text">
                    Доступ закрыт. Магазин только для совершеннолетних.
                  </p>
                  <Press className="btn btn-ghost" onClick={() => setAge("pending")}>
                    Вернуться
                  </Press>
                </>
              )}
            </motion.section>
          ) : (
            <motion.section
              key={screen}
              className={screen === "home" || screen === "catalog" ? "panel panel-home" : screen === "cart" || screen === "checkout" || screen === "orders" || screen === "courier" || screen === "admin" ? "panel panel-cart" : "panel"}
              {...soft}
            >
              {screen === "home" ? <Home onOpen={setScreen} onProduct={openProduct} onCart={() => setScreen("cart")} cartCount={cartCount} token={session?.token ?? null} city={session?.city || "HH"} /> : null}
              {screen === "catalog" ? (
                <div className={productId ? "screen-hold" : undefined}>
                  <Catalog
                    mode={catalogMode}
                    items={liveProducts}
                    cart={cart}
                    onAdd={(id) => { addToCart(id); }}
                    onOpen={openProduct}
                    onRefresh={() => setCatalogMode("loading")}
                  />
                </div>
              ) : null}
              {screen === "catalog" && productId && catalogMode === "demo" ? (
                <ProductScreen productId={productId} cart={cart} onBack={closeProduct} onAdd={addToCart} />
              ) : null}
              {screen === "cart" ? (
                <CartScreen
                  cart={cart}
                  adjusted={cartAdjusted}
                  onQty={changeQty}
                  onRemove={removeLine}
                  onRestore={restoreLine}
                  onOpen={openProduct}
                  onCatalog={() => setScreen("catalog")}
                  onContinue={() => { setCheckoutHeld(true); setCheckoutOpen(true); }}
                />
              ) : null}
              {screen === "checkout" && !session ? <p className="empty-text">Нет сессии. Запустите API и откройте приложение снова.</p> : null}
              {screen === "orders" && session ? <OrdersScreen token={session.token} city={session.city} onCatalog={() => setScreen("catalog")} /> : null}
              {screen === "orders" && !session ? <p className="empty-text">История откроется после входа.</p> : null}
              {screen === "profile" ? (
                <Profile
                  session={session}
                  onCourier={() => {
                    if (session && (session.user.status === "courier" || session.user.status === "admin")) {
                      window.location.hash = "#/courier";
                      setScreen("courier");
                    }
                  }}
                  onAdmin={() => {
                    if (session?.user.status === "admin") {
                      window.location.hash = "#/admin";
                      setScreen("admin");
                    }
                  }}
                  onRole={async (tgId) => {
                    localStorage.setItem("elfin-dev-user", tgId);
                    const next = await api<Session>("/api/auth/dev", { method: "POST", body: { tgId } });
                    setSession({ ...next, city: session?.city || next.city });
                    setScreen("profile");
                  }}
                />
              ) : null}
              {screen === "courier" && session && (session.user.status === "courier" || session.user.status === "admin") ? (
                <CourierScreen token={session.token} city={session.city} />
              ) : null}
              {screen === "admin" && session?.user.status === "admin" ? <AdminScreen token={session.token} city={session.city} /> : null}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {age === "ok" ? (
          <motion.nav
            className="nav"
            aria-label="Разделы"
            initial={reduce ? false : { y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: 16, opacity: 0 }}
            transition={{ duration: 0.38, ease }}
          >
            {screens.map((item) => {
              const active = item.id === screen || (screen === "checkout" && item.id === "cart") || ((screen === "courier" || screen === "admin") && item.id === "profile");
              return (
                <Press
                  key={item.id}
                  className={active ? "nav-btn is-active" : "nav-btn"}
                  current={active}
                  onClick={() => setScreen(item.id)}
                >
                  {active ? (
                    reduce ? <span className="nav-pill" /> : <motion.span layoutId="nav-pill" className="nav-pill" transition={navIndicator} />
                  ) : null}
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {item.id === "cart" && cartCount > 0 ? <CountBump className="nav-badge" value={cartCount} label={`В корзине ${cartCount}`} /> : null}
                </Press>
              );
            })}
          </motion.nav>
        ) : null}
      </AnimatePresence>
      {session && checkoutHeld ? (
        <div className={checkoutOpen ? "sheet-layer is-open" : "sheet-layer"} aria-hidden={!checkoutOpen} inert={!checkoutOpen ? true : undefined}>
          <button type="button" className="sheet-scrim" aria-label="Закрыть оформление" onClick={() => setCheckoutOpen(false)} />
          <div className="sheet-panel" role="dialog" aria-label="Оформление заказа">
            <CheckoutScreen
              cart={cart}
              token={session.token}
              city={session.city}
              user={session.user}
              couriers={couriers}
              onClearCart={() => setCart({})}
              onCatalog={() => { setCheckoutOpen(false); setScreen("catalog"); }}
              onOrders={() => { setCheckoutOpen(false); setScreen("orders"); }}
              onClose={() => setCheckoutOpen(false)}
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
  onCart,
  cartCount,
  token,
  city,
}: {
  onOpen: (screen: Screen) => void;
  onProduct: (id: string) => void;
  onCart: () => void;
  cartCount: number;
  token: string | null;
  city: string;
}) {
  const reduce = useReducedMotion();
  const [terms, setTerms] = useState(false);
  const shelf = products.filter((item) => shopSection(item.category)).slice(0, 4);
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
        <button
          type="button"
          className="catalog-icon home-cart"
          aria-label={cartCount > 0 ? `Корзина, ${cartCount}` : "Корзина"}
          onClick={onCart}
        >
          <BagMark />
          {cartCount > 0 ? <span className="home-badge">{cartCount}</span> : null}
        </button>
      </motion.div>
      <motion.section className="home-banner" variants={sectionItem}>
        <p className="home-kicker">ELFIN Market · Hamburg</p>
        <h2>Всё в одном месте</h2>
        <p>Магазин, получение и товары Hamburg.</p>
        <button type="button" className="home-terms-link" onClick={() => setTerms(true)}>
          Подробнее об условиях
        </button>
      </motion.section>
      <motion.div variants={sectionItem}>
        <LoyaltyProgress token={token} city={city} />
      </motion.div>
      <motion.div className="catalog home-vitrine" variants={sectionItem}>
        <div className="home-shelf-head">
          <h2>Каталог <span className="home-demo">DEMO</span></h2>
          <button type="button" className="home-all" onClick={() => onOpen("catalog")}>Смотреть всё</button>
        </div>
        <div className="shelf">
          {shelf.map((item) => (
            <button key={item.id} type="button" className="product home-card" onClick={() => onProduct(item.id)}>
              <HomeArt item={item} />
              <span className="product-name">{item.brand || item.name}</span>
              <span className="product-flavor">{item.flavor}</span>
              <span className="product-price"><strong>—</strong></span>
            </button>
          ))}
        </div>
      </motion.div>
      {terms && stage
        ? createPortal(
            <div className="terms-layer">
              <button type="button" className="terms-scrim" aria-label="Закрыть условия" onClick={() => setTerms(false)} />
              <div className="terms-card" role="dialog" aria-labelledby="home-terms-title">
                <h2 id="home-terms-title">Условия</h2>
                <p>Только с 18 лет. Магазин работает в Hamburg. Оплата при встрече. Скидки за повторные покупки и сравнение цен сейчас не действуют.</p>
                <button type="button" className="terms-close" onClick={() => setTerms(false)}>Закрыть</button>
              </div>
            </div>,
            stage,
          )
        : null}
    </motion.div>
  );
}

function BagMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" />
    </svg>
  );
}

function HomeArt({ item }: { item: Product }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const node = image.current;
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, [item.catalogImage]);
  if (!item.catalogImage || failed) return <span className="product-art"><span className="mark" aria-hidden="true" /></span>;
  return (
    <span className="product-art">
      <img
        ref={image}
        className={loaded ? "product-photo is-in" : "product-photo"}
        src={item.catalogImage}
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
  onCourier,
  onAdmin,
  onRole,
}: {
  session: Session | null;
  onCourier: () => void;
  onAdmin: () => void;
  onRole: (tgId: string) => void;
}) {
  const facts = [
    ["Возраст", "подтверждён"],
    ["Город", "Hamburg"],
    ["Роль", session?.user.status || "нет сессии"],
  ];
  const staff = session?.user.status === "courier" || session?.user.status === "admin";

  return (
    <div className="facts">
      {facts.map(([label, value]) => (
        <div key={label} className="fact">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {staff ? <Press className="btn btn-ghost" onClick={onCourier}>Панель курьера</Press> : null}
      {session?.user.status === "admin" ? <Press className="btn btn-ghost" onClick={onAdmin}>Админка</Press> : null}
      {session?.dev ? (
        <div className="choice-row">
          <button type="button" className="choice" onClick={() => onRole("123456789")}>Покупатель</button>
          <button type="button" className="choice" onClick={() => onRole("100000001")}>Север</button>
          <button type="button" className="choice" onClick={() => onRole("100000002")}>Иней</button>
          <button type="button" className="choice" onClick={() => onRole("100000009")}>Админ</button>
        </div>
      ) : null}
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
