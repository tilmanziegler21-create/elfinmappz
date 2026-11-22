import { useEffect, useMemo, useState } from "react";
import { lineTitle } from "./catalogLine";
import { useI18n } from "./i18n";
import { euro, type Product, type Variant } from "./products";

type AddResult = "added" | "limit" | "unavailable";

function openChoices(product: Product) {
  return product.variants
    .filter((item) => item.availability !== "out" && item.stock > 0)
    .map((item) => ({ ...item, label: item.label === "—" ? lineTitle(product) : item.label }));
}

function ChoiceRow({
  label,
  options,
  selected,
  multiple,
  onPick,
}: {
  label: string;
  options: Variant[];
  selected: string[];
  multiple?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <fieldset className="set-step">
      <legend>{label}</legend>
      <div className="cat-chips" role={multiple ? "group" : "radiogroup"} aria-label={label}>
        {options.map((item) => {
          const on = selected.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              className={on ? "cat-chip is-on" : "cat-chip"}
              onClick={() => onPick(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SetBuilder({
  pods,
  liquids,
  onAdd,
}: {
  pods: Product[];
  liquids: Product[];
  onAdd: (id: string, qty?: number, variantId?: string) => AddResult;
}) {
  const { t } = useI18n();
  const [modelId, setModelId] = useState("");
  const [colorId, setColorId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [note, setNote] = useState<"added" | "missing" | null>(null);
  const model = pods.find((item) => item.id === modelId) ?? null;
  const brand = liquids.find((item) => item.id === brandId) ?? null;
  const colors = useMemo(() => (model ? openChoices(model) : []), [model]);
  const flavors = useMemo(() => (brand ? openChoices(brand) : []), [brand]);
  const color = colors.find((item) => item.id === colorId) ?? null;
  const picked = flavors.filter((item) => flavorIds.includes(item.id));
  const ready = Boolean(color && picked.length);
  const sum = (color?.price ?? 0) + picked.reduce((total, item) => total + item.price, 0);

  useEffect(() => {
    setColorId("");
    setNote(null);
  }, [modelId]);

  useEffect(() => {
    setFlavorIds([]);
    setNote(null);
  }, [brandId]);

  function toggleFlavor(id: string) {
    setNote(null);
    setFlavorIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function add() {
    if (!model || !color || !brand || !picked.length) return;
    const results = [onAdd(model.id, 1, color.id), ...picked.map((item) => onAdd(brand.id, 1, item.id))];
    setNote(results.every((item) => item === "added") ? "added" : "missing");
  }

  return (
    <div className="set-build">
      <p className="set-lead">{t("set.pick")}</p>
      <fieldset className="set-step">
        <legend>{t("set.model")}</legend>
        {pods.length ? (
          <div className="cat-chips" role="radiogroup" aria-label={t("set.model")}>
            {pods.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === modelId}
                className={item.id === modelId ? "cat-chip is-on" : "cat-chip"}
                disabled={item.availability === "out"}
                onClick={() => setModelId(item.id)}
              >
                {lineTitle(item)}
              </button>
            ))}
          </div>
        ) : <p className="set-empty">{t("set.noDevice")}</p>}
      </fieldset>
      {model ? <ChoiceRow label={t("set.color")} options={colors} selected={color ? [color.id] : []} onPick={(id) => { setColorId(id); setNote(null); }} /> : null}
      <fieldset className="set-step">
        <legend>{t("set.brand")}</legend>
        {liquids.length ? (
          <div className="cat-chips" role="radiogroup" aria-label={t("set.brand")}>
            {liquids.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={item.id === brandId}
                className={item.id === brandId ? "cat-chip is-on" : "cat-chip"}
                disabled={item.availability === "out"}
                onClick={() => setBrandId(item.id)}
              >
                {lineTitle(item)}
              </button>
            ))}
          </div>
        ) : <p className="set-empty">{t("set.noLiquid")}</p>}
      </fieldset>
      {brand ? <ChoiceRow label={t("set.flavors")} options={flavors} selected={flavorIds} multiple onPick={toggleFlavor} /> : null}
      <div className="set-sum">
        <strong>{ready ? euro(sum) : "—"}</strong>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={add}>{t("set.add")}</button>
      </div>
      {note ? <p className="set-note" role="status">{t(note === "added" ? "set.added" : "set.missing")}</p> : null}
    </div>
  );
}
