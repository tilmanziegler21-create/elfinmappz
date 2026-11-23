import { useEffect, useMemo, useState } from "react";
import { lineTitle } from "./catalogLine";
import { isPodCategory } from "./categoryRules";
import { useI18n } from "./i18n";
import { mediaByBrand, mediaBySku } from "./productMedia";
import { euro, lineKey, type Product, type Variant } from "./products";
import { saveSetBundle } from "./setBundle";
import { setShot } from "./setCopy";
import { useTheme } from "./theme";

type AddResult = "added" | "limit" | "unavailable";
type Choice = Variant & { image?: string; productId: string; brandTitle: string };
type PickId = { productId: string; id: string };

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

function shotFor(product: Product, variantId: string) {
  return mediaBySku(variantId)?.image || picture(product);
}

function openChoices(product: Product): Choice[] {
  const brandTitle = lineTitle(product);
  return product.variants
    .filter((item) => item.availability !== "out" && item.stock > 0)
    .map((item) => ({ ...item, productId: product.id, brandTitle, image: shotFor(product, item.id), label: item.label === "—" ? brandTitle : item.label }));
}

function samePick(item: Choice, pick: PickId | null) {
  return Boolean(pick && item.productId === pick.productId && item.id === pick.id);
}

function colorDot(label: string) {
  const name = label.split("·").pop()?.trim().toLowerCase() || "";
  const dots: Record<string, string> = {
    black: "#17191d",
    brown: "#6d4b34",
    "jelly blue": "#2f8fe0",
    "jelly green": "#2faf6a",
    "jelly orange": "#ef7a32",
    "jelly pink": "#ee6d9a",
    "plume blue": "#8fd0f2",
    "plume pink": "#f2b3cc",
    "plume white": "#f4f7fb",
  };
  return dots[name] || "var(--accent)";
}

function Shot({ src, alt }: { src?: string; alt: string }) {
  if (!src) return <span className="set-shot-empty" aria-hidden="true" />;
  return <img src={src} alt={alt} draggable={false} />;
}

export function SetBuilder({
  pods,
  liquids,
  cartridges = [],
  cart = {},
  initialOffer,
  onAdd,
}: {
  pods: Product[];
  liquids: Product[];
  cartridges?: Product[];
  cart?: Record<string, number>;
  initialOffer?: string;
  onAdd: (id: string, qty?: number, variantId?: string) => AddResult;
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const devices = pods.filter((item) => isPodCategory(item.category));
  const [offerId, setOfferId] = useState("");
  const [colorPick, setColorPick] = useState<PickId | null>(null);
  const [brandId, setBrandId] = useState("");
  const [cartridgePick, setCartridgePick] = useState<PickId | null>(null);
  const [flavorPicks, setFlavorPicks] = useState<PickId[]>([]);
  const [note, setNote] = useState<"added" | "missing" | null>(null);
  useEffect(() => {
    if (!initialOffer) return;
    setOfferId(initialOffer);
    setColorPick(null);
    setBrandId("");
    setCartridgePick(null);
    setFlavorPicks([]);
    setNote(null);
  }, [initialOffer]);
  const offer = offers.find((item) => item.id === offerId) ?? null;
  const stockedLiquids = liquids.filter((item) => openChoices(item).some((choice) => choice.stock - (cart[lineKey(choice.productId, choice.id)] ?? 0) >= 1 || flavorPicks.some((pick) => samePick(choice, pick))));
  const brand = stockedLiquids.find((item) => item.id === brandId) ?? stockedLiquids[0] ?? null;

  function room(item: Choice, qty: number) {
    return item.stock - (cart[lineKey(item.productId, item.id)] ?? 0) >= qty;
  }

  const colors = useMemo(() => devices.flatMap((item) => openChoices(item).map((choice) => ({
    ...choice,
    label: devices.length > 1 ? `${lineTitle(item)} · ${choice.label}` : choice.label,
  }))).filter((item) => samePick(item, colorPick) || item.stock - (cart[lineKey(item.productId, item.id)] ?? 0) >= 1), [devices, cart, colorPick]);
  const cartridgeChoices = useMemo(() => {
    const all = cartridges.flatMap((item) => openChoices(item));
    if (!offer || offer.cartridges === 0) return all;
    return all.filter((item) => item.stock - (cart[lineKey(item.productId, item.id)] ?? 0) >= offer.cartridges);
  }, [cartridges, offer, cart]);
  const catalogFlavors = useMemo(() => liquids.flatMap((item) => openChoices(item)).filter((item) => flavorPicks.some((pick) => samePick(item, pick)) || item.stock - (cart[lineKey(item.productId, item.id)] ?? 0) >= 1), [liquids, cart, flavorPicks]);
  const flavors = useMemo(() => (brand ? catalogFlavors.filter((item) => item.productId === brand.id) : []), [brand, catalogFlavors]);
  const color = colors.find((item) => samePick(item, colorPick)) ?? null;
  const cartridge = cartridgeChoices.length === 1
    ? cartridgeChoices[0]
    : cartridgeChoices.find((item) => samePick(item, cartridgePick)) ?? null;
  const picked = flavorPicks.flatMap((pick) => catalogFlavors.filter((item) => samePick(item, pick)));
  const ready = Boolean(offer && picked.length === offer.liquids && (!offer.pod || color) && (offer.cartridges === 0 || cartridge));

  function reset(id: string) {
    setOfferId(id);
    setColorPick(null);
    setBrandId("");
    setCartridgePick(null);
    setFlavorPicks([]);
    setNote(null);
  }

  function toggleFlavor(pick: PickId) {
    if (!offer) return;
    setNote(null);
    setFlavorPicks((current) => {
      if (current.some((item) => item.productId === pick.productId && item.id === pick.id)) {
        return current.filter((item) => item.productId !== pick.productId || item.id !== pick.id);
      }
      if (current.length >= offer.liquids) return current;
      return [...current, pick];
    });
  }

  function status() {
    if (!offer) return "";
    if (offer.pod && colors.length === 0) return t("set.noDevice");
    if (offer.pod && !color) return t("set.needColor");
    if (offer.cartridges > 0 && cartridgeChoices.length === 0) return t("set.noCartridge");
    if (offer.cartridges > 0 && !cartridge) return t("set.needCartridge");
    if (liquids.length === 0) return t("set.noLiquid");
    return "";
  }

  function add() {
    if (!offer || !ready || (offer.cartridges > 0 && !cartridge)) return;
    const lines: Array<[string, number, string, Choice]> = [];
    if (offer.pod && color) lines.push([color.productId, 1, color.id, color]);
    for (const flavor of picked) lines.push([flavor.productId, 1, flavor.id, flavor]);
    if (offer.cartridges > 0 && cartridge) lines.push([cartridge.productId, offer.cartridges, cartridge.id, cartridge]);
    if (lines.some(([, qty, , item]) => !room(item, qty))) {
      setNote("missing");
      return;
    }
    const results = lines.map(([id, qty, variantId]) => onAdd(id, qty, variantId));
    const added = results.length > 0 && results.every((item) => item === "added");
    if (added) {
      const saved: Record<string, number> = {};
      for (const [id, qty, variantId] of lines) saved[lineKey(id, variantId)] = (saved[lineKey(id, variantId)] ?? 0) + qty;
      const next = { ...cart };
      for (const [key, qty] of Object.entries(saved)) next[key] = (next[key] ?? 0) + qty;
      const same = Object.keys(next).length === Object.keys(saved).length && Object.entries(saved).every(([key, qty]) => next[key] === qty);
      if (same) saveSetBundle({ offerId: offer.id, price: offer.price, lines: saved });
    }
    setNote(added ? "added" : "missing");
  }

  if (!offer) {
    return (
      <div className="set-build">
        <p className="set-lead">{t("set.pick")}</p>
        <div className="set-list">
          {offers.map((item) => (
            <button key={item.id} type="button" className="set-row" onClick={() => reset(item.id)}>
              <span className="set-row-art"><Shot src={setShot(item.id, theme)} alt="" /></span>
              <span className="set-row-foot">
                <span className="set-row-copy">
                  <strong>{t(`set.${item.id}.title`)}</strong>
                  <em>{t(`set.${item.id}.line`)}</em>
                </span>
                <span className="set-row-price">{euro(item.price)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="set-build">
      <button type="button" className="set-row" onClick={() => reset("")}>
        <span className="set-row-art"><Shot src={setShot(offer.id, theme)} alt="" /></span>
        <span className="set-row-foot">
          <span className="set-row-copy">
            <strong>{t(`set.${offer.id}.title`)}</strong>
            <em>{t(`set.${offer.id}.line`)}</em>
          </span>
          <span className="set-row-price">{euro(offer.price)}</span>
        </span>
      </button>
      {offer.pod ? (
        <fieldset className="set-step">
          <legend>{t("set.color")}</legend>
          {picture(devices[0] ?? null) ? <div className="set-device-preview"><Shot src={color?.image || picture(devices[0] ?? null)} alt="" /></div> : null}
          {colors.length ? (
            <div className="set-colors" role="radiogroup" aria-label={t("set.color")}>
              {colors.map((item) => (
                <button key={item.productId + item.id} type="button" role="radio" aria-checked={samePick(item, colorPick)} className={samePick(item, colorPick) ? "set-color is-on" : "set-color"} onClick={() => { setColorPick({ productId: item.productId, id: item.id }); setNote(null); }}>
                  <i style={{ background: colorDot(item.label) }} aria-hidden="true" />
                  {item.label}
                </button>
              ))}
            </div>
          ) : <p className="set-empty">{t("set.noDevice")}</p>}
        </fieldset>
      ) : null}
      {offer.cartridges > 0 ? (
        <fieldset className="set-step">
          <legend>{t("set.cartridge")}</legend>
          {cartridgeChoices.length === 0 ? <p className="set-empty">{t("set.noCartridge")}</p> : cartridgeChoices.length === 1 ? (
            <p className="set-fixed">{cartridgeChoices[0].label} × {offer.cartridges}</p>
          ) : (
            <div className="set-swatches" role="radiogroup" aria-label={t("set.cartridge")}>
              {cartridgeChoices.map((item) => (
                <button key={item.productId + item.id} type="button" role="radio" aria-checked={samePick(item, cartridgePick)} className={samePick(item, cartridgePick) ? "set-swatch is-on" : "set-swatch"} onClick={() => { setCartridgePick({ productId: item.productId, id: item.id }); setNote(null); }}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}
      {stockedLiquids.length > 1 ? (
        <fieldset className="set-step">
          <legend>{t("set.brand")}</legend>
          <div className="set-swatches" role="radiogroup" aria-label={t("set.brand")}>
            {stockedLiquids.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={item.id === brand?.id} className={item.id === brand?.id ? "set-swatch is-on" : "set-swatch"} onClick={() => { setBrandId(item.id); setNote(null); }}>
                {lineTitle(item)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : stockedLiquids.length === 0 ? <p className="set-empty">{t("set.noLiquid")}</p> : null}
      {brand ? (
        <fieldset className="set-step">
          <legend>{t("set.flavors")}</legend>
          {picked.some((item) => item.productId !== brand.id) ? (
            <div className="set-kept">
              {picked.filter((item) => item.productId !== brand.id).map((item) => (
                <button key={item.productId + item.id} type="button" className="set-check is-on" onClick={() => toggleFlavor(item)}>
                  <span>{item.brandTitle} · {item.label}</span>
                  <i aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
          {flavors.length ? (
            <div className="set-checks" role="group" aria-label={t("set.flavors")}>
              {flavors.map((item) => {
                const on = flavorPicks.some((pick) => samePick(item, pick));
                return (
                  <button key={item.productId + item.id} type="button" role="checkbox" aria-checked={on} className={on ? "set-check is-on" : "set-check"} onClick={() => toggleFlavor(item)}>
                    <span>{item.label}</span>
                    <i aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : <p className="set-empty">{t("set.noLiquid")}</p>}
        </fieldset>
      ) : null}
      <div className="set-dock">
        <p className="set-count">{t("set.picked", { have: picked.length, need: offer.liquids })}</p>
        {status() ? <p className="set-note">{status()}</p> : null}
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={add}>{t("set.add")} · {euro(offer.price)}</button>
        {note ? <p className="set-note" role="status">{t(note === "added" ? "set.added" : "set.missing")}</p> : null}
      </div>
    </div>
  );
}
