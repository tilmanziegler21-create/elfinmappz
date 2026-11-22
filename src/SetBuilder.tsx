import { useMemo, useState } from "react";
import { lineTitle } from "./catalogLine";
import { isPodCategory } from "./categoryRules";
import { useI18n } from "./i18n";
import { mediaByBrand } from "./productMedia";
import { euro, type Product, type Variant } from "./products";

type AddResult = "added" | "limit" | "unavailable";
type Choice = Variant & { image?: string };

const steps = ["model", "color", "brand", "flavors"] as const;

function picture(product: Product | null) {
  if (!product) return "";
  return product.catalogImage || mediaByBrand(lineTitle(product))?.image || mediaByBrand(product.brand || "")?.image || "";
}

function openChoices(product: Product, image?: string): Choice[] {
  return product.variants
    .filter((item) => item.availability !== "out" && item.stock > 0)
    .map((item) => ({ ...item, image, label: item.label === "—" ? lineTitle(product) : item.label }));
}

function Shot({ src, alt }: { src?: string; alt: string }) {
  const [ready, setReady] = useState(false);
  if (!src) return <span className="set-shot-empty" aria-hidden="true" />;
  return <img className={ready ? "is-in" : ""} src={src} alt={alt} draggable={false} onLoad={() => setReady(true)} />;
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
  const devices = pods.filter((item) => isPodCategory(item.category));
  const [step, setStep] = useState(0);
  const [modelId, setModelId] = useState("");
  const [colorId, setColorId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [note, setNote] = useState<"added" | "missing" | null>(null);
  const model = devices.find((item) => item.id === modelId) ?? null;
  const brand = liquids.find((item) => item.id === brandId) ?? null;
  const modelShot = picture(model);
  const brandShot = picture(brand);
  const colors = useMemo(() => (model ? openChoices(model, modelShot) : []), [model, modelShot]);
  const flavors = useMemo(() => (brand ? openChoices(brand, brandShot) : []), [brand, brandShot]);
  const color = colors.find((item) => item.id === colorId) ?? null;
  const picked = flavors.filter((item) => flavorIds.includes(item.id));
  const sum = (color?.price ?? 0) + picked.reduce((total, item) => total + item.price, 0);
  const current = steps[step];

  function pickModel(id: string) {
    setModelId(id);
    setColorId("");
    setNote(null);
    setStep(1);
  }

  function pickColor(id: string) {
    setColorId(id);
    setNote(null);
    setStep(2);
  }

  function pickBrand(id: string) {
    setBrandId(id);
    setFlavorIds([]);
    setNote(null);
    setStep(3);
  }

  function toggleFlavor(id: string) {
    setNote(null);
    setFlavorIds((currentIds) => (currentIds.includes(id) ? currentIds.filter((item) => item !== id) : [...currentIds, id]));
  }

  function add() {
    if (!model || !color || !brand || !picked.length) return;
    const results = [onAdd(model.id, 1, color.id), ...picked.map((item) => onAdd(brand.id, 1, item.id))];
    setNote(results.every((item) => item === "added") ? "added" : "missing");
  }

  const choices: Choice[] = current === "model"
    ? devices.map((item) => ({ id: item.id, label: lineTitle(item), price: item.price, availability: item.availability, stock: item.variants.reduce((sumStock, variant) => sumStock + variant.stock, 0), image: picture(item) }))
    : current === "color"
      ? colors
      : current === "brand"
        ? liquids.map((item) => ({ id: item.id, label: lineTitle(item), price: item.price, availability: item.availability, stock: item.variants.reduce((sumStock, variant) => sumStock + variant.stock, 0), image: picture(item) }))
        : flavors;
  const selected = current === "model" ? modelId : current === "color" ? colorId : current === "brand" ? brandId : "";
  const empty = current === "model" || current === "color" ? t("set.noDevice") : t("set.noLiquid");

  return (
    <div className="set-build">
      <p className="set-lead">{t("set.progress", { step: step + 1, total: steps.length })}</p>
      {(modelShot || brandShot) ? (
        <div className="set-preview" aria-hidden="true">
          <figure><Shot src={modelShot} alt="" /></figure>
          <figure><Shot src={brandShot} alt="" /></figure>
        </div>
      ) : null}
      {model ? <p className="set-note">{lineTitle(model)}{color ? ` · ${color.label}` : ""}</p> : null}
      {brand ? <p className="set-note">{lineTitle(brand)}{picked.length ? ` · ${picked.map((item) => item.label).join(", ")}` : ""}</p> : null}
      <fieldset className="set-step">
        <legend>{t(`set.${current}`)}</legend>
        {choices.length ? (
          <div className="set-choices" role={current === "flavors" ? "group" : "radiogroup"} aria-label={t(`set.${current}`)}>
            {choices.map((item) => {
              const on = current === "flavors" ? flavorIds.includes(item.id) : item.id === selected;
              return (
                <button
                  key={item.id}
                  type="button"
                  role={current === "flavors" ? "checkbox" : "radio"}
                  aria-checked={on}
                  className={on ? "set-choice is-on" : "set-choice"}
                  onClick={() => {
                    if (current === "model") pickModel(item.id);
                    else if (current === "color") pickColor(item.id);
                    else if (current === "brand") pickBrand(item.id);
                    else toggleFlavor(item.id);
                  }}
                >
                  <span className="set-choice-art"><Shot src={item.image} alt="" /></span>
                  <span className="set-choice-name">{item.label}</span>
                  {current === "model" || current === "brand" ? <span className="set-choice-price">{euro(item.price)}</span> : null}
                </button>
              );
            })}
          </div>
        ) : <p className="set-empty">{empty}</p>}
      </fieldset>
      <div className="set-sum">
        {step > 0 ? <button type="button" className="btn btn-ghost" onClick={() => setStep((value) => Math.max(0, value - 1))}>{t("set.back")}</button> : <span />}
        {current === "flavors" ? (
          <button type="button" className="btn btn-primary" disabled={!picked.length || !color} onClick={add}>{t("set.add")}{picked.length && color ? ` · ${euro(sum)}` : ""}</button>
        ) : null}
      </div>
      {note ? <p className="set-note" role="status">{t(note === "added" ? "set.added" : "set.missing")}</p> : null}
    </div>
  );
}
