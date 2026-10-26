import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EmptyState } from "./EmptyState";
import { cartEntries, cartMoney, euro } from "./products";
import { favoriteExit } from "./productMotion";
import { cardItem, cardList, ease, tapSpring } from "./motion";

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
  const lines = cartEntries(cart);
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cartMoney(cart);
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
          title="Корзина пуста"
          description="Здесь появятся выбранные товары."
          primaryAction={{ label: "В каталог", onClick: onCatalog }}
          secondaryAction={undo ? { label: "Вернуть", onClick: restore } : undefined}
        />
      ) : lines.length > 0 || !revealEmpty ? (
        <motion.div
          className="cart-list"
          variants={cardList}
          initial={reduce ? false : "hidden"}
          animate="show"
        >
          {adjusted ? <p className="cart-note">Недоступные позиции убраны.</p> : null}
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
                  layout
                >
                  <button type="button" className="cart-open" onClick={() => onOpen(line.product.id)}>
                    <span className="cart-thumb" aria-hidden="true">
                      <span className="mark" />
                    </span>
                    <span className="cart-copy">
                      <span className="cart-name">{line.product.name}</span>
                      <span className="cart-meta">
                        {line.variant.label} · {euro(line.variant.price)}
                      </span>
                    </span>
                  </button>
                  <motion.button
                    type="button"
                    className="cart-remove"
                    onClick={() => remove(line.key)}
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    transition={tapSpring}
                    aria-label={`Убрать ${line.product.name}, ${line.variant.label}`}
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
                        aria-label="Меньше"
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
                        aria-label="Больше"
                      >
                        +
                      </motion.button>
                    </div>
                    <Amount value={euro(line.total)} />
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : null}

      {undo && lines.length > 0 ? (
        <div className="cart-undo" role="status">
          <span>Позиция убрана</span>
          <button type="button" onClick={restore}>Вернуть</button>
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="cart-bar">
          <div className="cart-sum">
            <span>{lines.length} {positionWord(lines.length)} · {units} шт.</span>
            <Amount value={euro(total)} />
          </div>
          <div className="cart-sum">
            <span>Итого</span>
            <Amount value={euro(total)} />
          </div>
          <p className="cart-caption">Предварительно, до подтверждения складом.</p>
          <motion.button
            type="button"
            className="btn btn-primary"
            onClick={onContinue}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={tapSpring}
          >
            К оформлению
          </motion.button>
        </div>
      ) : null}
    </div>
  );
}

function positionWord(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "позиция";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "позиции";
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
