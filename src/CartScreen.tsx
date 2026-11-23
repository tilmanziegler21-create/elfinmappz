import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "./EmptyState";
import { lineTitle } from "./catalogLine";
import { priceCategory } from "./categoryRules";
import { cartTitle } from "./lineLabel";
import { priceCart, euro } from "./products";
import { favoriteExit } from "./productMotion";
import { cardItem, cardList, ease, tapSpring } from "./motion";
import { moneyLocale, useI18n } from "./i18n";
import { bundleOffer } from "./setBundle";
import { setNumberOf, setShot } from "./setCopy";
import { useTheme } from "./theme";

export function CartScreen({
  cart,
  adjusted,
  onQty,
  onRemove,
  onRestore,
  onOpen,
  onCatalog,
  onContinue,
}: {
  cart: Record<string, number>;
  adjusted: boolean;
  onQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string, qty: number) => void;
  onOpen: (productId: string) => void;
  onCatalog: () => void;
  onContinue: () => void;
}) {
  const reduce = useReducedMotion();
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const money = moneyLocale(lang);
  const priced = priceCart(cart);
  const lines = priced.lines;
  const bundle = bundleOffer(cart);
  const extras = bundle ? lines.filter((line) => !bundle.lines[line.key]) : lines;
  const positions = bundle ? 1 + extras.length : lines.length;
  const units = (bundle ? 1 : 0) + extras.reduce((sum, line) => sum + line.qty, 0);
  const total = priced.total;
  const [undo, setUndo] = useState<{ lines: { key: string; qty: number }[] } | null>(null);
  const [revealEmpty, setRevealEmpty] = useState(lines.length === 0);
  const previousCount = useRef(lines.length);
  const lock = useRef(new Set<string>());

  useEffect(() => {
    if (lines.length > 0) {
      previousCount.current = lines.length;
      setRevealEmpty(false);
      return;
    }
    const delay = previousCount.current > 0 && !reduce ? 300 : 0;
    previousCount.current = 0;
    const id = window.setTimeout(() => setRevealEmpty(true), delay);
    return () => window.clearTimeout(id);
  }, [lines.length, reduce]);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => {
      for (const line of undo.lines) lock.current.delete(line.key);
      setUndo((current) => (current === undo ? null : current));
    }, 4000);
    return () => window.clearTimeout(id);
  }, [undo]);

  function remove(key: string) {
    if (lock.current.has(key)) return;
    const qty = cart[key] ?? 0;
    if (qty < 1) return;
    lock.current.add(key);
    onRemove(key);
    setUndo({ lines: [{ key, qty }] });
  }

  function removeBundle() {
    if (!bundle) return;
    const saved = Object.entries(bundle.lines).flatMap(([key, qty]) => {
      if (lock.current.has(key) || qty < 1) return [];
      lock.current.add(key);
      onRemove(key);
      return [{ key, qty }];
    });
    if (saved.length) setUndo({ lines: saved });
  }

  function restore() {
    if (!undo) return;
    for (const line of undo.lines) {
      lock.current.delete(line.key);
      onRestore(line.key, line.qty);
    }
    setUndo(null);
  }

  return (
    <div className="cart-page">
      {lines.length === 0 && revealEmpty ? (
        <EmptyState
          variant="cart"
          title={t("cart.empty")}
          description={t("cart.emptyText")}
          primaryAction={{ label: t("cart.toCatalog"), onClick: onCatalog }}
          secondaryAction={undo ? { label: t("cart.restore"), onClick: restore } : undefined}
        />
      ) : lines.length > 0 || !revealEmpty ? (
        <motion.div
          className="cart-list"
          variants={cardList}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {adjusted ? <p className="cart-note">{t("cart.adjusted")}</p> : null}
          <AnimatePresence initial={false}>
            {bundle ? (
              <motion.article key={`set-${bundle.offerId}`} className="cart-item" variants={cardItem} exit={reduce ? undefined : favoriteExit} transition={{ duration: 0.28, ease }}>
                <button type="button" className="cart-open" onClick={() => onCatalog()}>
                  <CartThumb src={setShot(bundle.offerId, theme)} kind="set" />
                  <span className="cart-copy">
                    <span className="cart-brand">{t(`set.${bundle.offerId}.title`)}</span>
                    <span className="cart-name">{lines.filter((line) => bundle.lines[line.key]).map((line) => line.qty > 1 ? `${line.variant.label} × ${line.qty}` : line.variant.label).join(", ")}</span>
                    <span className="cart-meta">{euro(bundle.price, money)}</span>
                  </span>
                </button>
                <motion.button type="button" className="cart-remove" onClick={removeBundle} whileTap={reduce ? undefined : { scale: 0.96 }} transition={tapSpring} aria-label={t("cart.remove", { name: t(`set.${bundle.offerId}.title`), variant: "" })}>×</motion.button>
                <div className="cart-side">
                  <div className="qty">
                    <button type="button" disabled aria-label={t("product.less")}>−</button>
                    <span>1</span>
                    <button type="button" disabled aria-label={t("product.more")}>+</button>
                  </div>
                  <Amount value={euro(bundle.price, money)} />
                </div>
              </motion.article>
            ) : null}
            {extras.map((line) => {
              const blocked = line.variant.availability === "out" || line.variant.stock <= 0;
              const atLimit = line.qty >= line.variant.stock;
              const setNo = setNumberOf(line.product);
              const liquid = Boolean(priceCategory(line.product.category));
              const thumb = setNo ? setShot(setNo, theme) : line.product.catalogImage;
              return (
                <motion.article
                  key={line.key}
                  className="cart-item"
                  variants={cardItem}
                  exit={reduce ? undefined : favoriteExit}
                  transition={{ duration: 0.28, ease }}
                >
                  <button type="button" className="cart-open" onClick={() => onOpen(line.product.id)}>
                    <CartThumb src={thumb} kind={setNo ? "set" : liquid ? "liquid" : undefined} />
                    <span className="cart-copy">
                      <span className="cart-brand">{setNo ? t(`set.${setNo}.title`) : lineTitle(line.product)}</span>
                      <span className="cart-name" title={setNo ? t(`set.${setNo}.line`) : cartTitle(line.product, line.variant)}>{setNo ? t(`set.${setNo}.line`) : cartDetail(line.product, line.variant)}</span>
                      <span className="cart-meta">
                        {euro(line.unitPrice, money)}
                      </span>
                    </span>
                  </button>
                  <motion.button
                    type="button"
                    className="cart-remove"
                    onClick={() => remove(line.key)}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    transition={tapSpring}
                    aria-label={t("cart.remove", { name: line.product.name, variant: line.variant.label })}
                  >
                    ×
                  </motion.button>
                  <div className="cart-side">
                    <div className="qty">
                      <motion.button
                        type="button"
                        onClick={() => onQty(line.key, line.qty - 1)}
                        disabled={line.qty <= 1}
                        whileTap={reduce || line.qty <= 1 ? undefined : { scale: 0.96 }}
                        transition={tapSpring}
                        aria-label={t("product.less")}
                      >
                        −
                      </motion.button>
                      <motion.span
                        key={line.qty}
                        initial={reduce ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.22, ease }}
                      >
                        {line.qty}
                      </motion.span>
                      <motion.button
                        type="button"
                        onClick={() => onQty(line.key, line.qty + 1)}
                        disabled={blocked || atLimit}
                        whileTap={reduce || blocked || atLimit ? undefined : { scale: 0.96 }}
                        transition={tapSpring}
                        aria-label={t("product.more")}
                      >
                        +
                      </motion.button>
                    </div>
                    <Amount value={euro(line.total, money)} />
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : null}

      {undo && lines.length > 0 ? (
        <div className="cart-undo" role="status">
          <span>{t("cart.removed")}</span>
          <button type="button" onClick={restore}>{t("cart.restore")}</button>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="cart-bar">
          <div className="cart-sum">
            <span>{positions} {positionWord(positions, lang)} · {units} {t("cart.units")}</span>
            <Amount value={euro(priced.total, money)} />
          </div>
          <div className="cart-sum">
            <span>{t("cart.total")}</span>
            <Amount value={euro(total, money)} />
          </div>
          <p className="cart-caption">{t("cart.note")}</p>
          <motion.button
            type="button"
            className="btn btn-primary"
            onClick={onContinue}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={tapSpring}
          >
            {t("cart.checkout")}
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}

function cartDetail(product: { brand?: string; name?: string; flavor?: string; productLine?: string }, variant: { label?: string }) {
  const full = cartTitle(product, variant);
  const brand = lineTitle(product);
  if (brand && full.toLowerCase().startsWith(brand.toLowerCase())) {
    const rest = full.slice(brand.length).replace(/^[\s—\-–:·/]+/, "");
    return rest || full;
  }
  return full;
}

function positionWord(count: number, lang: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const one = mod10 === 1 && mod100 !== 11;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (lang === "uk") return one ? "позиція" : few ? "позиції" : "позицій";
  if (lang === "de") return count === 1 ? "Position" : "Positionen";
  if (lang === "en") return count === 1 ? "item" : "items";
  if (one) return "позиция";
  if (few) return "позиции";
  return "позиций";
}

function CartThumb({ src, kind }: { src?: string; kind?: "set" | "liquid" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <span className="cart-thumb" data-kind={kind} aria-hidden="true">
      {src && !failed
        ? <img src={src} alt="" decoding="async" onError={() => setFailed(true)} />
        : <span className="mark" />}
    </span>
  );
}

function Amount({ value }: { value: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.strong
      key={value}
      className="cart-amount"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease }}
    >
      {value}
    </motion.strong>
  );
}
