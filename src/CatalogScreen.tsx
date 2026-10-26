import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "./EmptyState";
import { preloadImages } from "./ImagePreloader";
import { productTap } from "./productMotion";
import { brandFilters, brandGroup, shopSection } from "./categoryRules";
import { availabilityLabel, euro, products, unitsFor, type Product } from "./products";
import { cardItem, cardList, tapSpring } from "./motion";
import { readSaved, SAVED_EVENT, writeSaved } from "./saved";

const sections = ["Все", "Жидкости", "POD", "Устройства"] as const;

export function Catalog({
  cart,
  items,
  mode,
  onAdd,
  onOpen,
  onRefresh,
}: {
  cart: Record<string, number>;
  items: Product[];
  mode: "loading" | "demo" | "live" | "error";
  onAdd: (id: string) => void;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<(typeof sections)[number]>("Все");
  const [brand, setBrand] = useState("Все бренды");
  const [savedOnly, setSavedOnly] = useState(false);
  const [inStock, setInStock] = useState(false);
  const [saved, setSaved] = useState(readSaved);

  const source = useMemo(
    () => (mode === "demo" ? products.filter((item) => shopSection(item.category)) : items),
    [mode, items],
  );

  useEffect(() => {
    if (mode !== "demo" && mode !== "live") return;
    preloadImages(source.map((item) => item.catalogImage), "soon");
    preloadImages(source.map((item) => item.heroImage), "idle");
    const sync = () => setSaved(readSaved());
    window.addEventListener(SAVED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SAVED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [source, mode]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return source.filter((item) => {
      const group = shopSection(item.category);
      const inSection = section === "Все" || group === section;
      const inBrand = section !== "Жидкости" || brand === "Все бренды" || brandGroup(item.brand || "") === brand;
      const inSaved = !savedOnly || saved.includes(item.id);
      const stockOk = !inStock || (item.availability !== "out" && !item.preview);
      const inQuery = needle.length === 0
        || item.name.toLowerCase().includes(needle)
        || item.flavor.toLowerCase().includes(needle)
        || (item.brand || "").toLowerCase().includes(needle);
      return inSection && inBrand && inSaved && stockOk && inQuery;
    });
  }, [source, query, section, brand, savedOnly, saved, inStock]);

  const catalogEmpty = mode === "live" && source.length === 0;
  const showGrid = (mode === "demo" || mode === "live") && visible.length > 0;

  function chooseSection(next: (typeof sections)[number]) {
    setSection(next);
    if (next !== "Жидкости") setBrand("Все бренды");
  }

  function resetFilters() {
    setQuery("");
    setSection("Все");
    setBrand("Все бренды");
    setSavedOnly(false);
    setInStock(false);
  }

  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id];
    setSaved(next);
    writeSaved(next);
  }

  function refreshCatalog() {
    onRefresh();
  }

  return (
    <div className="catalog">
      <div className="catalog-tools">
        <div className="catalog-bar">
          <img className="catalog-elf" src="/elf.jpg" alt="" />
          <p className="catalog-word">ELFIN Market</p>
          <button
            type="button"
            className={savedOnly ? "catalog-icon is-on" : "catalog-icon"}
            aria-pressed={savedOnly}
            aria-label="Избранное"
            onClick={() => setSavedOnly((value) => !value)}
          >
            <HeartIcon filled={savedOnly} />
          </button>
        </div>
        <label className="search catalog-search">
          <span className="search-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск товаров и вкусов"
            enterKeyHint="search"
            aria-label="Поиск"
          />
        </label>
        <div className="cat-chips" role="tablist" aria-label="Разделы">
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === section}
              className={item === section ? "cat-chip is-on" : "cat-chip"}
              onClick={() => chooseSection(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {section === "Жидкости" ? (
          <div className="cat-chips" role="tablist" aria-label="Бренды">
            {["Все бренды", ...brandFilters].map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={item === brand}
                className={item === brand ? "cat-chip is-on" : "cat-chip"}
                onClick={() => setBrand(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {mode === "loading" ? <CatalogSkeleton /> : null}

      {mode === "error" ? (
        <EmptyState
          variant="connectionError"
          size="lg"
          title="Каталог не загрузился"
          description="Вкладки Hamburg в таблице не найдены. Данные другого города не показываются."
          primaryAction={{ label: "Обновить", onClick: refreshCatalog }}
        />
      ) : null}

      {mode !== "error" && mode !== "loading" && catalogEmpty ? (
        <EmptyState
          variant="catalog"
          size="lg"
          title="Каталог пока пуст"
          description="Доступные позиции появятся здесь после обновления ассортимента."
          primaryAction={{ label: "Обновить", onClick: refreshCatalog }}
        />
      ) : null}

      {mode === "demo" ? <p className="catalog-demo">Демо. Цены и остатки Hamburg не подключены.</p> : null}

      {mode !== "error" && mode !== "loading" && !catalogEmpty && visible.length === 0 ? (
        <EmptyState
          variant="search"
          size="sm"
          title={savedOnly ? "В избранном пока пусто" : inStock && mode === "demo" ? "Склад не подключён" : "Ничего не найдено"}
          description={savedOnly ? "Отметьте сердце на карточке витрины." : inStock && mode === "demo" ? "Остатки появятся из таблицы Hamburg." : "Попробуй изменить запрос или раздел."}
          primaryAction={{ label: "Сбросить фильтры", onClick: resetFilters }}
        />
      ) : null}

      {showGrid && (mode === "demo" || mode === "live") ? (
        <section className="catalog-section">
          <div className="catalog-head">
            <h2 className="section-label">Каталог</h2>
            <button
              type="button"
              className={inStock ? "stock-toggle is-on" : "stock-toggle"}
              aria-pressed={inStock}
              onClick={() => setInStock((value) => !value)}
            >
              По наличию
            </button>
          </div>
          <ProductGrid key={`${section}-${brand}-${savedOnly}-${inStock}-${query}`} items={visible} cart={cart} saved={saved} mode={mode} onAdd={onAdd} onOpen={onOpen} onToggle={toggleSaved} reduce={Boolean(reduce)} />
        </section>
      ) : null}
    </div>
  );
}

function ProductGrid({
  items,
  cart,
  saved,
  mode,
  onAdd,
  onOpen,
  onToggle,
  reduce,
}: {
  items: Product[];
  cart: Record<string, number>;
  saved: string[];
  mode: "demo" | "live";
  onAdd: (id: string) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  reduce: boolean;
}) {
  return (
    <motion.div className="shelf" initial={reduce ? false : "hidden"} animate="show" variants={cardList}>
      {items.map((item) => {
        const liked = saved.includes(item.id);
        const demo = mode === "demo";
        const blocked = item.availability === "out" || item.preview;
        return (
          <motion.article
            key={item.id}
            className="product"
            data-card="catalog"
            variants={cardItem}
            whileTap={reduce ? undefined : productTap}
            onClick={() => onOpen(item.id)}
          >
            <div className="product-art">
              <ProductArt item={item} />
              <button
                type="button"
                className={liked ? "card-heart is-on" : "card-heart"}
                aria-pressed={liked}
                aria-label={liked ? "Убрать из избранного" : "В избранное"}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(item.id);
                }}
              >
                <HeartIcon filled={liked} />
              </button>
            </div>
            <h3 className="product-name">{item.brand || item.name}</h3>
            <p className="product-flavor">{item.flavor}</p>
            <p className="product-price">
              <strong>{demo ? "—" : euro(item.price)}</strong>
            </p>
            <p className={demo ? "stock" : `stock stock-${item.availability}`}>{demo ? "Демо" : availabilityLabel[item.availability]}</p>
            <motion.button
              type="button"
              className="btn btn-primary product-cta"
              disabled={!demo && blocked}
              whileTap={reduce || (!demo && blocked) ? undefined : productTap}
              transition={tapSpring}
              onClick={(event) => {
                event.stopPropagation();
                if (demo || blocked) onOpen(item.id);
                else onAdd(item.id);
              }}
            >
              {demo ? "Открыть" : blocked ? "Нет в наличии" : unitsFor(cart, item.id) ? `В корзине · ${unitsFor(cart, item.id)}` : "В корзину"}
            </motion.button>
          </motion.article>
        );
      })}
    </motion.div>
  );
}

function ProductArt({ item }: { item: Product }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const node = image.current;
    if (node?.complete && node.naturalWidth > 0) setLoaded(true);
  }, [item.catalogImage]);
  if (!item.catalogImage || failed) return <span className="mark" aria-hidden="true" />;
  return (
    <img
      ref={image}
      className={loaded ? "product-photo is-in" : "product-photo"}
      src={item.catalogImage}
      alt=""
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}

function CatalogSkeleton() {
  return (
    <div className="shelf" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => (
        <div className="product skel-product" key={index}>
          <div className="product-art skel" />
          <div className="skel skel-line" />
          <div className="skel skel-line skel-line-short" />
        </div>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.2" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
      <path d="M12 19.2 5.4 12.8a3.8 3.8 0 0 1 5.4-5.4L12 8.6l1.2-1.2a3.8 3.8 0 0 1 5.4 5.4Z" />
    </svg>
  );
}
