import { useMemo, useState } from "react";
import { lineTitle } from "./catalogLine";
import { isPodCategory } from "./categoryRules";
import { useI18n } from "./i18n";
import { mediaByBrand } from "./productMedia";
import { euro, type Product, type Variant } from "./products";
import { setShot } from "./setCopy";
import { useTheme } from "./theme";

type AddResult = "added" | "limit" | "unavailable";
type Choice = Variant & { image?: string; productId: string };

const offers = [
  { id: "1", liquids: 1, cartridges: 2, pod: false, price: 25, oldPrice: 30 },
  { id: "2", liquids: 2, cartridges: 4, pod: false, price: 45, oldPrice: 56 },
  { id: "3", liquids: 2, cartridges: 0, pod: true, price: 50, oldPrice: 62 },
  { id: "4", liquids: 2, cartridges: 2, pod: true, price: 60, oldPrice: 76 },
  { id: "5", liquids: 4, cartridges: 0, pod: true, price: 70, oldPrice: 94 },
  { id: "6", liquids: 4, cartridges: 4, pod: true, price: 90, oldPrice: 118 },
] as const;

function picture(product: Product | null) {
  if (!product) return "";
  return product.catalogImage || mediaByBrand(lineTitle(product))?.image || mediaByBrand(product.brand || "")?.image || "";
}

function openChoices(product: Product, image?: string): Choice[] {
  return product.variants
    .filter((item) => item.availability !== "out" && item.stock > 0)
    .map((item) => ({ ...item, productId: product.id, image, label: item.label === "—" ? lineTitle(product) : item.label }));
}

function Shot({ src, alt }: { src?: string; alt: string }) {
  const [ready, setReady] = useState(false);
  if (!src) return <span className="set-shot-empty" aria-hidden="true" />;
  return <img className={ready ? "is-in" : ""} src={src} alt={alt} draggable={false} onLoad={() => setReady(true)} />;
}

export function SetBuilder({
  pods,
  liquids,
  cartridges = [],
  onAdd,
}: {
  pods: Product[];
  liquids: Product[];
  cartridges?: Product[];
  onAdd: (id: string, qty?: number, variantId?: string) => AddResult;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const devices = pods.filter((item) => isPodCategory(item.category));
  const cartridgeChoices = cartridges.flatMap((item) => openChoices(item, picture(item)));
  const [offerId, setOfferId] = useState("");
  const [colorId, setColorId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [cartridgeId, setCartridgeId] = useState("");
  const [flavorIds, setFlavorIds] = useState<string[]>([]);
  const [note, setNote] = useState<"added" | "missing" | null>(null);
  const offer = offers.find((item) => item.id === offerId) ?? null;
  const brand = liquids.find((item) => item.id === brandId) ?? null;
  const brandShot = picture(brand);
  const colors = useMemo(() => devices.flatMap((item) => openChoices(item, picture(item)).map((choice) => ({
    ...choice,
    label: devices.length > 1 ? `${lineTitle(item)} · ${choice.label}` : choice.label,
  }))), [devices]);
  const flavors = useMemo(() => (brand ? openChoices(brand, brandShot) : []), [brand, brandShot]);
  const color = colors.find((item) => item.id === colorId) ?? null;
  const cartridge = cartridgeChoices.find((item) => item.id === cartridgeId) ?? (cartridgeChoices.length === 1 ? cartridgeChoices[0] : null);
  const picked = flavors.filter((item) => flavorIds.includes(item.id));
  const ready = Boolean(offer && picked.length === offer.liquids && (!offer.pod || color) && (offer.cartridges === 0 || cartridge));

  function chooseOffer(id: string) {
    setOfferId(id);
    setColorId("");
    setBrandId("");
    setCartridgeId("");
    setFlavorIds([]);
    setNote(null);
  }

  function toggleFlavor(id: string) {
    if (!offer) return;
    setNote(null);
    setFlavorIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= offer.liquids) return [...current.slice(1), id];
      return [...current, id];
    });
  }

  function add() {
    if (!offer || !ready || !brand || !cartridge && offer.cartridges > 0) return;
    const results: AddResult[] = [];
    if (offer.pod && color) results.push(onAdd(color.productId, 1, color.id));
    for (const flavor of picked) results.push(onAdd(brand.id, 1, flavor.id));
    if (offer.cartridges > 0 && cartridge) results.push(onAdd(cartridge.productId, offer.cartridges, cartridge.id));
    setNote(results.length > 0 && results.every((item) => item === "added") ? "added" : "missing");
  }

  if (!offer) {
    return (
      <div className="set-build">
        <p className="set-lead">{t("set.pick")}</p>
        <div className="set-choices">
          {offers.map((item) => (
            <button key={item.id} type="button" className="set-choice set-offer" onClick={() => chooseOffer(item.id)}>
              <span className="set-choice-art set-offer-art"><Shot src={setShot(item.id, theme)} alt="" /></span>
              <span className="set-choice-name">{t(`set.${item.id}.title`)}</span>
              <span className="set-choice-line">{t(`set.${item.id}.line`)}</span>
              <span className="set-choice-price">{euro(item.price)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="set-build">
      <p className="set-lead">{t("set.changes")}</p>
      <button type="button" className="set-chosen" onClick={() => setOfferId("")}>
        <span className="set-choice-art set-offer-art"><Shot src={setShot(offer.id, theme)} alt="" /></span>
        <span>
          <strong>{t(`set.${offer.id}.title`)}</strong>
          <em>{t(`set.${offer.id}.line`)}</em>
        </span>
      </button>
      {offer.pod ? (
        <fieldset className="set-step">
          <legend>{t("set.color")}</legend>
          {colors.length ? (
            <div className="set-choices" role="radiogroup" aria-label={t("set.color")}>
              {colors.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={item.id === colorId} className={item.id === colorId ? "set-choice is-on" : "set-choice"} onClick={() => { setColorId(item.id); setNote(null); }}>
                  <span className="set-choice-art"><Shot src={item.image} alt="" /></span>
                  <span className="set-choice-name">{item.label}</span>
                </button>
              ))}
            </div>
          ) : <p className="set-empty">{t("set.noDevice")}</p>}
        </fieldset>
      ) : null}
      {offer.cartridges > 0 && cartridgeChoices.length > 1 ? (
        <fieldset className="set-step">
          <legend>{t("set.model")}</legend>
          <div className="set-choices" role="radiogroup">
            {cartridgeChoices.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={item.id === (cartridgeId || cartridge?.id)} className={item.id === (cartridgeId || cartridge?.id) ? "set-choice is-on" : "set-choice"} onClick={() => setCartridgeId(item.id)}>
                <span className="set-choice-art"><Shot src={item.image} alt="" /></span>
                <span className="set-choice-name">{item.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className="set-step">
        <legend>{t("set.brand")}</legend>
        {liquids.length ? (
          <div className="set-choices" role="radiogroup" aria-label={t("set.brand")}>
            {liquids.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={item.id === brandId} className={item.id === brandId ? "set-choice is-on" : "set-choice"} onClick={() => { setBrandId(item.id); setFlavorIds([]); setNote(null); }}>
                <span className="set-choice-art"><Shot src={picture(item)} alt="" /></span>
                <span className="set-choice-name">{lineTitle(item)}</span>
                <span className="set-choice-price">{euro(item.price)}</span>
              </button>
            ))}
          </div>
        ) : <p className="set-empty">{t("set.noLiquid")}</p>}
      </fieldset>
      {brand ? (
        <fieldset className="set-step">
          <legend>{t("set.flavorNeed", { count: offer.liquids })}</legend>
          <div className="set-choices" role="group" aria-label={t("set.flavors")}>
            {flavors.map((item) => (
              <button key={item.id} type="button" role="checkbox" aria-checked={flavorIds.includes(item.id)} className={flavorIds.includes(item.id) ? "set-choice is-on" : "set-choice"} onClick={() => toggleFlavor(item.id)}>
                <span className="set-choice-art"><Shot src={item.image} alt="" /></span>
                <span className="set-choice-name">{item.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="set-sum">
        <button type="button" className="btn btn-ghost" onClick={() => setOfferId("")}>{t("set.back")}</button>
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={add}>{t("set.add")} · {euro(offer.price)}</button>
      </div>
      {note ? <p className="set-note" role="status">{t(note === "added" ? "set.added" : "set.missing")}</p> : null}
    </div>
  );
}
