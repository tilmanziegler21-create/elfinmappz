import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CountBump } from "./CountBump";
import { preloadImages } from "./ImagePreloader";
import { sectionLabel } from "./categoryRules";
import { ProductFloatStage } from "./ProductFloatStage";
import { lineTitle } from "./catalogLine";
import { mediaByBrand, mediaBySku, mediaFor } from "./productMedia";
import { VariantBottomSheet } from "./VariantBottomSheet";
import { addPulse, liteMotion, productTap } from "./productMotion";
import {
  defaultVariant,
  euro,
  cartEntries,
  findProduct,
  lineUnit,
  quantityOffer,
  lineKey,
  stockLine,
  products,
  type Variant,
} from "./products";
import { tapSpring } from "./motion";
import { readSaved, SAVED_EVENT, writeSaved } from "./saved";
import { moneyLocale, useI18n } from "./i18n";
import { setNumberOf, setShot } from "./setCopy";
import { useTheme } from "./theme";

type AddResult = "added" | "limit" | "unavailable";

export function ProductScreen({
  productId,
  startQty = 1,
  cart,
  onBack,
  onAdd,
  onCart,
}: {
  productId: string;
  startQty?: number;
  cart: Record<string, number>;
  onBack: () => void;
  onAdd: (productId: string, qty: number, variantId: string) => AddResult;
  onCart: () => void;
}) {
  const reduce = useReducedMotion();
  const product = findProduct(productId);
  const [variantId, setVariantId] = useState<string | null>(product ? defaultVariant(product)?.id ?? null : null);
  const [qty, setQty] = useState(1);
  const { t, lang } = useI18n();
  const { theme } = useTheme();
  const money = moneyLocale(lang);
  const [note, setNote] = useState<"added" | "limit" | "out" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [dealNote, setDealNote] = useState(false);
  const [saved, setSaved] = useState(readSaved);
  const lite = liteMotion();

  function leave() {
    onBack();
  }

  useEffect(() => {
    const next = findProduct(productId);
    const stock = next ? defaultVariant(next)?.stock ?? 1 : 1;
    setVariantId(next ? defaultVariant(next)?.id ?? null : null);
    setQty(Math.max(1, Math.min(startQty, Math.max(stock, 1))));
    setNote(null);
    setSheet(false);
    setDealNote(false);
  }, [productId, startQty]);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 1100);
    return () => window.clearTimeout(id);
  }, [note]);

  useEffect(() => {
    if (!product) return;
    setVariantId((current) => (current && product.variants.some((item) => item.id === current) ? current : defaultVariant(product)?.id ?? null));
  }, [product]);

  useEffect(() => {
    const currentImage = findProduct(productId);
    preloadImages([currentImage?.heroImage], "soon");
    preloadImages(products.filter((item) => item.id !== productId).map((item) => item.heroImage), "idle");
  }, [productId]);

  useEffect(() => {
    const sync = () => setSaved(readSaved());
    window.addEventListener(SAVED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SAVED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!product) {
    return (
      <div className="product-page">
        <ProductBar category={t("header.catalog")} cartCount={cartTotal(cart)} onBack={leave} onCart={onCart} />
        <div className="empty catalog-empty">
          <div className="mark mark-lg" aria-hidden="true" />
          <p className="empty-title">{t("product.missing")}</p>
          <p className="empty-text">{t("product.missingText")}</p>
        </div>
      </div>
    );
  }

  const current = product;
  const variant = current.variants.find((item) => item.id === variantId) ?? null;
  const flavorChoice = current.variants.some((item) => item.label !== "—" && !/\d+\s*мл/i.test(item.label))
    && !current.variants.some((item) => /\d+\s*мл/i.test(item.label));
  const media = (variant ? mediaBySku(variant.id) : null) ?? mediaFor(current.id) ?? mediaBySku(current.id) ?? mediaByBrand(lineTitle(current));
  const setNo = setNumberOf(current);
  const heroImage = setNo ? setShot(setNo, theme) : (media?.image ?? current.heroImage);
  const preset = media?.scene ?? (current.id === "elfliq-watermelon" ? "liquid-float" as const : undefined);
  const accent = media?.accent ?? (current.id === "elfliq-watermelon" ? "melon" as const : undefined);
  const inCart = variant ? cart[lineKey(product.id, variant.id)] ?? 0 : 0;
  const remaining = variant ? Math.max(0, variant.stock - inCart) : 0;
  const blocked = !variant || variant.availability === "out" || remaining <= 0;
  const bucket = current.category.trim().toLowerCase();
  const bucketInCart = cartEntries(cart).reduce((sum, line) => sum + (line.product.category.trim().toLowerCase() === bucket ? line.qty : 0), 0);
  const total = variant ? lineUnit(current.category, variant.price, bucketInCart + qty) * qty : 0;
  const offer = current.preview ? null : quantityOffer(current.category);
  const pricedSteps = offer?.steps.filter((step) => !step.talk) ?? [];
  const activeQty = pricedSteps.reduce((mark, step) => (bucketInCart + qty >= step.qty ? step.qty : mark), pricedSteps[0]?.qty ?? 0);
  const full = offer ? offer.base * qty : total;
  const save = offer ? Math.max(0, Math.round((full - total) * 100) / 100) : 0;

  function choose(next: Variant) {
    if (next.availability === "out" || next.stock <= 0) return;
    setVariantId(next.id);
    setQty(1);
    setNote(null);
  }

  function add() {
    if (!variant || blocked) return;
    const result = onAdd(current.id, qty, variant.id);
    setNote(result === "added" ? "added" : result === "limit" ? "limit" : "out");
    if (result === "added") setQty(1);
  }

  return (
    <div className="product-page">
      <ProductBar category={sectionTitle(sectionLabel(current.category), t)} cartCount={cartTotal(cart)} onBack={leave} onCart={onCart} />
      <div className="product-scroll">
        <motion.div
          className="hero-scene"
          data-lite={lite ? "true" : "false"}
          data-scene={preset}
          data-accent={accent ?? "ice"}
          data-frames="1"
          initial={false}
        >
          <span className="hero-glow" />
          <span className="hero-gem hero-gem-a" />
          <span className="hero-gem hero-gem-b" />
          <ProductFloatStage
              image={heroImage}
              label={current.name}
              frameKey={current.id}
              lite={lite}
              preset={preset}
              accent={accent}
            >
              <ProductMark category={current.category} frame={0} />
            </ProductFloatStage>
        </motion.div>

        <div className="product-copy">
          <p className="product-kicker">{setNo ? t(`set.${setNo}.line`) : flavorChoice ? (variant?.label ?? current.flavor) : current.flavor}</p>
          <div className="product-title-row">
            <h2 className="product-heading">{setNo ? t(`set.${setNo}.title`) : current.name}</h2>
            <button
              type="button"
              className={saved.includes(current.id) ? "save-btn is-on" : "save-btn"}
              aria-pressed={saved.includes(current.id)}
              aria-label={saved.includes(current.id) ? t("product.saved") : t("product.save")}
              onClick={() => {
                const next = saved.includes(current.id)
                  ? saved.filter((id) => id !== current.id)
                  : [...saved, current.id];
                setSaved(next);
                writeSaved(next);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" fill={saved.includes(current.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
                <path d="M12 19.2 5.4 12.8a3.8 3.8 0 0 1 5.4-5.4L12 8.6l1.2-1.2a3.8 3.8 0 0 1 5.4 5.4Z" />
              </svg>
            </button>
          </div>
          <p className="product-price product-price-lg">
            {current.preview ? <strong>—</strong> : offer ? <strong>{t("product.from", { sum: euro(offer.base, money) })}</strong> : variant ? <strong>{euro(variant.price, money)}</strong> : <strong>{euro(current.price, money)}</strong>}
            {!current.preview && !offer && variant?.oldPrice ? <s>{euro(variant.oldPrice, money)}</s> : null}
          </p>
          {offer ? (
            <section className="qty-deal" aria-label={t("product.qtyDeal")}>
              <div className="qty-deal-head">
                <span className="qty-deal-mark" aria-hidden="true">%</span>
                <strong>{t("product.qtyDeal")}</strong>
                <button type="button" className="qty-deal-info" aria-expanded={dealNote} aria-label={t("product.qtyAbout")} onClick={() => setDealNote((value) => !value)}>i</button>
              </div>
              {dealNote ? <p className="qty-deal-note">{offer.steps.some((step) => step.talk) ? t("product.qtyInfo") : t("product.qtyInfoPack")}</p> : null}
              <div className="qty-deal-grid">
                {offer.steps.map((step) => step.talk ? (
                  <div key={step.qty} className="qty-step is-talk">
                    <span>{t("product.qtyFive")}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 11.2a2.2 2.2 0 1 0-2.2-2.2 2.2 2.2 0 0 0 2.2 2.2Zm7.6 1a1.8 1.8 0 1 0-1.8-1.8 1.8 1.8 0 0 0 1.8 1.8ZM4.2 18.5v-1.1a2.6 2.6 0 0 1 2.6-2.6h2.8a2.6 2.6 0 0 1 2.6 2.6v1.1M13 18.5v-.8a2.2 2.2 0 0 1 2.2-2.2h1.6a2.2 2.2 0 0 1 2.2 2.2v.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    <b>{t("product.qtyTalk")}</b>
                  </div>
                ) : (
                  <button
                    key={step.qty}
                    type="button"
                    className={step.qty === activeQty ? "qty-step is-on" : "qty-step"}
                    disabled={blocked || remaining < step.qty}
                    onClick={() => setQty(step.qty)}
                  >
                    {step.percent > 0 ? <em>−{step.percent}%</em> : null}
                    <span>{step.qty === 5 ? t("product.qtyFive") : t("product.qtyPiece", { count: step.qty })}</span>
                    <b>{euro(step.total, money)}</b>
                    {step.save > 0 ? <s>{euro(step.full, money)}</s> : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <p className={current.preview ? "stock" : `stock stock-${remaining <= 0 ? "out" : remaining <= 2 ? "low" : "in"}`}>
            {current.preview ? t("product.sample") : stockLine(t, remaining <= 0 ? "out" : remaining <= 2 ? "low" : "in", remaining)}
          </p>
          <button type="button" className="variant-trigger" aria-label={flavorChoice ? t("product.chooseFlavor") : t("product.chooseVolume")} onClick={() => setSheet(true)}>
            <span>{setNo ? t(`set.${setNo}.line`) : (variant?.label ?? t("product.choose"))}</span>
            <strong>{current.preview || !variant ? "—" : euro(variant.price, money)}</strong>
          </button>
          <h3 className="section-label">{t("product.qty")}</h3>
          <div className="qty">
            <motion.button type="button" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={blocked || qty <= 1} whileTap={reduce || blocked || qty <= 1 ? undefined : productTap} transition={tapSpring} aria-label={t("product.less")}>
              −
            </motion.button>
            <span>{blocked ? 0 : qty}</span>
            <motion.button
              type="button"
              onClick={() => setQty((value) => Math.min(remaining, value + 1))}
              disabled={blocked || qty >= remaining}
              whileTap={reduce || blocked || qty >= remaining ? undefined : productTap}
              transition={tapSpring}
              aria-label={t("product.more")}
            >
              +
            </motion.button>
          </div>
          <VariantBottomSheet
            open={sheet}
            variants={current.variants}
            selectedId={variantId}
            hideCommerce={current.preview}
            kind={flavorChoice ? "вкус" : "объём"}
            onSelect={choose}
            onClose={() => setSheet(false)}
          />
          <p className="product-lead">{current.description}</p>

          <h3 className="section-label">{t("product.specs")}</h3>
          <div className="facts">
            <div className="fact"><span>{t("product.category")}</span><strong>{sectionTitle(sectionLabel(current.category), t)}</strong></div>
            <div className="fact"><span>{t("product.flavor")}</span><strong>{setNo ? t(`set.${setNo}.line`) : flavorChoice ? (variant?.label ?? "—") : current.flavor}</strong></div>
            {flavorChoice ? null : <div className="fact"><span>{t("product.volume")}</span><strong>{variant?.label ?? "—"}</strong></div>}
          </div>

        </div>
      </div>

      <div className="product-action">
        <motion.button
          type="button"
          className="btn btn-primary product-buy"
          disabled={blocked && note !== "added"}
          whileTap={reduce || blocked ? undefined : productTap}
          animate={note === "added" && !reduce ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={note === "added" ? addPulse : tapSpring}
          onClick={add}
        >
          <span>{note === "added" ? t("product.added") : current.preview ? t("product.noPrice") : blocked ? t("product.out") : t("product.buy", { sum: euro(total, money) })}</span>
          {note !== "added" && save > 0 ? <em className="buy-save">{t("product.qtySave", { sum: euro(save, money) })}</em> : null}
        </motion.button>
        <p className="product-note" role="status">{note === "added" ? t("product.addedNote") : note === "limit" ? t("product.limit") : note === "out" ? t("product.out") : ""}</p>
      </div>
    </div>
  );
}

function sectionTitle(value: string, t: (key: string) => string) {
  if (value === "Жидкости") return t("catalog.liquids");
  if (value === "Устройства") return t("catalog.devices");
  if (value === "Наборы") return t("catalog.sets");
  return value;
}

function ProductBar({
  category,
  cartCount,
  onBack,
  onCart,
}: {
  category: string;
  cartCount: number;
  onBack: () => void;
  onCart: () => void;
}) {
  const reduce = useReducedMotion();
  const { t } = useI18n();
  return (
    <div className="product-bar">
      <motion.button
        type="button"
        className="back-btn"
        onClick={onBack}
        whileTap={reduce ? undefined : { scale: 0.94, x: -2 }}
        transition={tapSpring}
        aria-label={t("product.back")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5.5 8.5 12 15 18.5" />
        </svg>
      </motion.button>
      <p className="product-bar-title">{category}</p>
      <CountBump className="cart-pill" value={cartCount} label={cartCount > 0 ? t("home.cartCount", { count: cartCount }) : t("product.cart")} onClick={onCart} />
    </div>
  );
}

function ProductMark({ category, frame }: { category: string; frame: number }) {
  const tone = category === "Ягода" ? "#7e3d86" : category === "Холод" ? "#1d6ec8" : "#2f8f9a";
  return (
    <svg className="product-mark" viewBox="0 0 160 180" aria-hidden="true">
      <path d="M80 18 126 46v52L80 154 34 98V46z" fill="none" stroke={tone} strokeWidth="3" opacity={frame === 0 ? 1 : 0.35} />
      <path d="M80 34 112 52v40L80 126 48 92V52z" fill={frame === 0 ? "rgba(255,255,255,0.82)" : tone} opacity={frame === 0 ? 1 : 0.9} />
      <path d="M80 34 96 78 80 126 64 78z" fill={tone} opacity={frame === 0 ? 0.28 : 0.55} />
      <path d="M48 52h64" stroke="white" strokeWidth="2" opacity="0.8" />
    </svg>
  );
}

function cartTotal(cart: Record<string, number>) {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}
