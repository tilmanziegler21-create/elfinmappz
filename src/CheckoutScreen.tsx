import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CrystalIllustration } from "./CrystalIllustration";
import { EmptyState } from "./EmptyState";
import { api, todayDate, type ApiCourier, type AuthPhase, type SessionUser } from "./api";
import { courierChatLink } from "./telegram";
import { cartTitle, orderNumber } from "./lineLabel";
import { priceCart, euro } from "./products";
import { tapSpring } from "./motion";
import { moneyLocale, useI18n } from "./i18n";

export function CheckoutScreen({
  cart,
  token,
  city,
  user,
  verified = false,
  authPhase = "unauthenticated",
  payments = ["cash"],
  botUrl = null,
  couriers,
  onClearCart,
  onCatalog,
  onHome,
  onOrders,
  onClose,
  authFailed = false,
}: {
  cart: Record<string, number>;
  token: string;
  city: string;
  user: SessionUser;
  verified?: boolean;
  authPhase?: AuthPhase;
  payments?: string[];
  botUrl?: string | null;
  couriers: ApiCourier[];
  onClearCart: () => void;
  onCatalog: () => void;
  onHome?: () => void;
  onOrders: () => void;
  onClose?: () => void;
  authFailed?: boolean;
}) {
  const reduce = useReducedMotion();
  const { t, lang } = useI18n();
  const money = moneyLocale(lang);
  const priced = priceCart(cart);
  const lines = priced.lines;
  const total = priced.total;
  const idempotencyKey = useRef(`checkout-${crypto.randomUUID()}`);
  const createdId = useRef<string | null>(null);
  const confirmed = useRef(false);
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [courierId, setCourierId] = useState("");
  const courier = couriers.find((item) => item.courier_id === courierId) ?? null;
  const slots = courier?.slots ?? [];
  const [time, setTime] = useState(slots[0] ?? "");
  const [payment, setPayment] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "loading" | "done">("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [doneTotal, setDoneTotal] = useState(total);
  const [noticePending, setNoticePending] = useState(false);
  const [writeCourier, setWriteCourier] = useState<{ url?: string; start?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const signedOut = !verified && (!token || authPhase === "expired" || authPhase === "error" || authFailed);
  const telegramGate = !(Boolean(user.tgId) && !signedOut);

  function chooseCourier(id: string) {
    const next = couriers.find((item) => item.courier_id === id);
    setCourierId(id);
    setTime(next?.slots[0] ?? "");
  }

  function reportCheckout(code: string) {
    const requestId = idempotencyKey.current;
    void api("/api/order/trace", {
      method: "POST",
      headers: { "x-request-id": requestId },
      body: { stage: "CHECKOUT_SUBMIT", code },
    }).catch(() => undefined);
  }

  async function submit() {
    if (busy || phase !== "form") return;
    if (telegramGate) {
      reportCheckout(!token ? "NO_BEARER" : "AUTH_PHASE");
      setError(authFailed || authPhase === "expired" || authPhase === "error"
        ? t("checkout.auth")
        : t("checkout.gate"));
      return;
    }
    if (!payments.includes(payment)) {
      reportCheckout("PAYMENT_UNAVAILABLE");
      setError(t("checkout.badPay"));
      return;
    }
    if (!courier) {
      reportCheckout("NO_COURIER");
      setError(t("checkout.needCourier"));
      return;
    }
    if (!time) {
      reportCheckout("NO_SLOT");
      setError(t("checkout.needTime"));
      return;
    }
    setError(null);
    setBusy(true);
    setPhase("loading");
    let charged = total;
    try {
      if (!createdId.current) {
        const created = await api<{ orderId: string; displayNumber?: number | null; totalAmount?: number }>("/api/order/create", {
          method: "POST",
          token,
          headers: { "Idempotency-Key": idempotencyKey.current, "x-request-id": idempotencyKey.current },
          body: {
            city,
            promoCode: "",
            items: lines.map((line) => ({
              productId: line.variant.id,
              quantity: line.qty,
              variant: line.variant.label,
            })),
          },
        });
        createdId.current = created.orderId;
        if (created.displayNumber) setDisplayNumber(created.displayNumber);
        if (typeof created.totalAmount === "number") charged = created.totalAmount;
      }
      if (!confirmed.current) {
        const confirmedBody = await api<{ telegram?: boolean; displayNumber?: number | null; writeCourier?: { url?: string; start?: string } }>("/api/order/confirm", {
          method: "POST",
          token,
          headers: { "x-request-id": idempotencyKey.current },
          body: {
            orderId: createdId.current,
            city,
            deliveryMethod: fulfillment === "delivery" ? "courier" : "pickup",
            courier_id: courier.courier_id,
            delivery_date: todayDate(),
            delivery_time: time,
            promoCode: "",
            courierData: {
              address: "",
              comment: "",
              user: {
                tgId: user.tgId,
                username: user.username,
              },
            },
          },
        });
        confirmed.current = true;
        if (confirmedBody.displayNumber) setDisplayNumber(confirmedBody.displayNumber);
        setNoticePending(confirmedBody.telegram === false);
        setWriteCourier(confirmedBody.writeCourier ?? null);
      }
      try {
        await api("/api/order/payment", {
          method: "POST",
          token,
          body: {
            orderId: createdId.current,
            city,
            paymentMethod: payment,
            bonusApplied: 0,
          },
        });
      } catch {
        /* The order is already stored. A later payment write must not look like a failed checkout. */
      }
      setDoneTotal(charged);
      setOrderId(createdId.current);
      setPhase("done");
      onClearCart();
    } catch (reason) {
      setBusy(false);
      setPhase("form");
      const message = reason instanceof Error ? reason.message : "";
      if (message === "Сервер не ответил.") reportCheckout("SERVER_UNREACHABLE");
      setError(checkoutNotice(message, t));
    }
  }

  if (phase === "done" && orderId) {
    const writeHref = courierChatLink(writeCourier, botUrl);
    return (
      <div className="empty-state">
        <div className="empty-crystal">
          <span className="empty-glow" />
          <span className="empty-float">
            <CrystalIllustration variant="orders" />
          </span>
        </div>
        <h2 className="empty-title">{t("checkout.done")}</h2>
        <p className="empty-text">{t("checkout.order", { id: orderNumber({ displayNumber, orderId }) })}</p>
        <p className="empty-text">{t("checkout.status")}</p>
        <p className="empty-text">{t("checkout.courierLine", { name: courier?.name || t("checkout.assigned") })}</p>
        <p className="empty-text">{t("checkout.when", { time })}</p>
        <p className="empty-text">{t("checkout.sum", { sum: euro(doneTotal, money) })}</p>
        {noticePending ? <p className="checkout-note">{t("checkout.notice")}</p> : null}
        <div className="empty-actions">
          {writeHref ? <a className="btn btn-primary empty-cta" href={writeHref} target="_blank" rel="noopener noreferrer">{t("checkout.write")}</a> : null}
          <button type="button" className="btn btn-ghost empty-cta" onClick={onOrders}>{t("checkout.myOrders")}</button>
          <button type="button" className="btn btn-ghost empty-cta" onClick={onHome || onCatalog}>{t("checkout.home")}</button>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        variant="cart"
        title={t("cart.empty")}
        description={t("checkout.emptyText")}
        primaryAction={{ label: t("cart.toCatalog"), onClick: onCatalog }}
      />
    );
  }

  if (phase === "loading") {
    return (
      <div className="empty-state">
        <div className="empty-crystal">
          <span className="empty-glow" />
          <span className="empty-float">
            <CrystalIllustration variant="orders" />
          </span>
        </div>
        <h2 className="empty-title">{t("checkout.loading")}</h2>
        <p className="empty-text">{t("checkout.loadingText")}</p>
      </div>
    );
  }

  return (
    <div className="checkout-page order-sheet">
      {onClose ? (
        <div className="sheet-head">
          <span className="sheet-grip" aria-hidden="true" />
          <button type="button" className="sheet-close" onClick={onClose}>{t("checkout.close")}</button>
        </div>
      ) : null}
      <div className="checkout-scroll">
        <div className="order-seg" role="group" aria-label={t("checkout.method")}>
          <button type="button" className={fulfillment === "pickup" ? "is-on" : ""} onClick={() => { setFulfillment("pickup"); setError(null); }}>{t("checkout.pickup")}</button>
          <button type="button" className={fulfillment === "delivery" ? "is-on" : ""} onClick={() => { setFulfillment("delivery"); setError(null); }}>{t("checkout.delivery")}</button>
        </div>
        <div className="checkout-card">
          {lines.map((line) => (
            <div className="checkout-line" key={line.key}>
              <span>{cartTitle(line.product, line.variant)}</span>
              <strong>{line.qty}</strong>
            </div>
          ))}
        </div>
        {authPhase === "initializing" ? <p className="cart-caption">{t("checkout.checking")}</p> : null}
        {user.tgId && !signedOut ? (
          <div className="facts">
            <div className="fact"><span>Telegram ID</span><strong>{user.tgId}</strong></div>
          </div>
        ) : authPhase === "initializing" ? null : (
          <p className="checkout-note">{authPhase === "expired" || authPhase === "error" || authFailed ? t("checkout.auth") : t("checkout.gate")}{botUrl && /^https:\/\/t\.me\/(?!\d+$)[A-Za-z0-9_]{5,32}$/.test(botUrl) ? <> <a href={botUrl} target="_blank" rel="noopener noreferrer">{t("checkout.openTg")}</a></> : null}</p>
        )}
        <div className="order-block">
          <label className={courierId ? "order-field is-set" : "order-field"}>
            <span>{t("checkout.courier")}</span>
            <select value={courierId} onChange={(event) => chooseCourier(event.target.value)}>
              <option value="">{t("checkout.pickCourier")}</option>
              {couriers.map((item) => (
                <option key={item.courier_id} value={item.courier_id}>{item.name} · {item.time_from}–{item.time_to}</option>
              ))}
            </select>
          </label>
          <label className={time ? "order-field is-set" : "order-field"}>
            <span>{t("checkout.time")}</span>
            <select value={time} onChange={(event) => setTime(event.target.value)} disabled={!courier}>
              <option value="">{courier ? t("checkout.time") : t("checkout.timeFirst")}</option>
              {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="order-dock">
        <p className="checkout-error" role={error ? "alert" : undefined}>{error ?? ""}</p>
        <div className="pay-row" role="group" aria-label={t("checkout.pay")}>
          <button type="button" className={payment === "cash" ? "pay-tile is-on" : "pay-tile"} aria-pressed={payment === "cash"} disabled={!payments.includes("cash")} onClick={() => setPayment("cash")}>
            {payment === "cash" ? <svg className="pay-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg> : null}
            {t("checkout.cash")}
          </button>
          <button type="button" className="pay-tile" disabled title={t("checkout.cardTitle")}>{t("checkout.card")}</button>
          <button type="button" className="pay-tile" disabled title={t("checkout.otherTitle")}>{t("checkout.other")}</button>
        </div>
        <p className="cart-caption">{t("checkout.cashOnly")}</p>
        <div className="order-sum">
          <span>{t("checkout.goods")}</span>
          <strong>{euro(priced.total, money)}</strong>
          <span>{t("checkout.fulfillment")}</span>
          <strong>{fulfillment === "pickup" ? t("checkout.pickup") : t("checkout.delivery")}</strong>
          <span className="is-total">{t("cart.total")}</span>
          <strong className="is-total">{euro(total, money)}</strong>
        </div>
        <motion.button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={busy || telegramGate}
          whileTap={reduce || busy || telegramGate ? undefined : { scale: 0.97 }}
          transition={tapSpring}
        >
          {t("checkout.confirm")}
        </motion.button>
      </div>
    </div>
  );
}

function checkoutNotice(message: string, t: (key: string) => string) {
  if (message === "ORDERS_NEED_DATABASE") return t("checkout.noDb");
  if (message === "Выберите курьера") return t("checkout.needCourier");
  if (message === "Выберите время") return t("checkout.needTime");
  if (message === "Укажите адрес" || message === "Укажите точку встречи") return message.endsWith(".") ? message : `${message}.`;
  if (message === "Этот способ оплаты недоступен.") return t("checkout.badPay");
  return t("checkout.saveFail");
}
