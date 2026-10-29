import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { availabilityLabel, euro, type Variant } from "./products";
import { variantSheetMove } from "./productMotion";

export function VariantBottomSheet({
  open,
  variants,
  selectedId,
  hideCommerce,
  kind = "объём",
  onSelect,
  onClose,
}: {
  open: boolean;
  variants: Variant[];
  selectedId: string | null;
  hideCommerce?: boolean;
  kind?: "объём" | "вкус";
  onSelect: (variant: Variant) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const visible = variants.filter((item) => item.label.toLowerCase().includes(needle));

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const focusId = window.setTimeout(() => searchRef.current?.focus(), reduce ? 0 : 80);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>("button, input")];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusId);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, reduce]);

  const host = document.querySelector(".stage") ?? document.body;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="sheet-back"
          onClick={onClose}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={kind === "вкус" ? "Вкус" : "Объём"}
            className="sheet"
            onClick={(event) => event.stopPropagation()}
            initial={reduce ? false : { y: "110%" }}
            animate={{ y: 0 }}
            exit={reduce ? undefined : { y: "110%" }}
            transition={reduce ? { duration: 0 } : variantSheetMove}
          >
            <span className="sheet-grip" aria-hidden="true" />
            <label className="sheet-search">
              <span>Поиск</span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={kind === "вкус" ? "Вкус" : "Объём"}
                aria-label={kind === "вкус" ? "Поиск вкуса" : "Поиск объёма"}
                enterKeyHint="search"
              />
            </label>
            <div className="sheet-list" role="listbox" aria-label={kind === "вкус" ? "Вкус" : "Объём"}>
              {visible.length === 0 ? <p className="sheet-empty">{kind === "вкус" ? "Такого вкуса нет." : "Такого объёма нет."}</p> : null}
              {visible.map((item) => {
                const closed = item.availability === "out" || item.stock <= 0;
                const selected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={closed}
                    className={selected ? "sheet-option is-on" : "sheet-option"}
                    onClick={() => {
                      if (closed) return;
                      onSelect(item);
                      onClose();
                    }}
                  >
                    <span>{item.label}</span>
                    <strong>{hideCommerce ? "—" : euro(item.price)}</strong>
                    <em>{hideCommerce ? "—" : closed ? "Нет" : `${availabilityLabel[item.availability]} · ${item.stock}`}</em>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    host,
  );
}
