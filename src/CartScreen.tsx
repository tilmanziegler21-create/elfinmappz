import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "./EmptyState";
import { lineTitle } from "./catalogLine";
import { cartTitle } from "./lineLabel";
import { priceCart, euro } from "./products";
import { favoriteExit } from "./productMotion";
import { cardItem, cardList, ease, tapSpring } from "./motion";
import { moneyLocale, useI18n } from "./i18n";

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
  const money = moneyLocale(lang);
  const priced = priceCart(cart);
  const lines = priced.lines;
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = priced.total;
  const [undo, setUndo] = useState<{ key: string; qty: number } | null>(null);
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
      lock.current.delete(undo.key);
      setUndo((current) => (current?.key === undo.key ? null : current));
    }, 4000);
    return () => window.clearTimeout(id);
  }, [undo]);

  function remove(key: string) {
    if (lock.current.has(key)) return;
    const qty = cart[key] ?? 0;
    if (qty < 1) return;
    lock.current.add(key);
    onRemove(key);
    setUndo({ key, qty });
  }

  function restore() {
    if (!undo) return;
    lock.current.delete(undo.key);
    onRestore(undo.key, undo.qty);
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
            {lines.map((line) => {
              const blocked = line.variant.availability === "out" || line.variant.stock <= 0;
              const atLimit = line.qty >= line.variant.stock;
              return (
                <motion.article
                  key={line.key}
                  className="cart-item"
                  variants={cardItem}
                  exit={reduce ? undefined : favoriteExit}
                  transition={{ duration: 0.28, ease }}
                >
                  <button type="button" className="cart-open" onClick={() => onOpen(line.product.id)}>
                    <span className="cart-thumb" aria-hidden="true">
                      {line.product.catalogImage
                        ? <img src={line.product.catalogImage} alt="" />
                        : <span className="mark" />}
                    </span>
                    <span className="cart-copy">
                      <span className="cart-brand">{lineTitle(line.product)}</span>
                      <span className="cart-name" title={cartTitle(line.product, line.variant)}>{cartDetail(line.product, line.variant)}</span>
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
            <span>{lines.length} {positionWord(lines.length, lang)} · {units} {t("cart.units")}</span>
            <Amount value={euro(total, money)} />
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
