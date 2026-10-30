import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CrystalIllustration } from "./CrystalIllustration";
import { EmptyState } from "./EmptyState";
import { api, todayDate, type ApiCourier, type AuthPhase, type SessionUser } from "./api";
import { courierChatLink } from "./telegram";
import { cartTitle, orderNumber } from "./lineLabel";
import { cartEntries, cartMoney, euro } from "./products";
import { tapSpring } from "./motion";

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
  const lines = cartEntries(cart);
  const total = cartMoney(cart);
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
    if (!token || authPhase === "expired" || authPhase === "error") {
      reportCheckout(!token ? "NO_BEARER" : "AUTH_PHASE");
      setError(authFailed || authPhase === "expired" || authPhase === "error"
        ? "Не удалось подтвердить вход через Telegram. Откройте приложение заново."
        : "Откройте магазин через Telegram, чтобы подтвердить заказ.");
      return;
    }
    if (!payments.includes(payment)) {
      reportCheckout("PAYMENT_UNAVAILABLE");
      setError("Этот способ оплаты недоступен.");
      return;
    }
    if (!courier) {
      reportCheckout("NO_COURIER");
      setError("Выберите курьера.");
      return;
    }
    if (!time) {
      reportCheckout("NO_SLOT");
      setError("Выберите время.");
      return;
    }
    setError(null);
    setBusy(true);
    setPhase("loading");
    try {
      if (!createdId.current) {
        const created = await api<{ orderId: string; displayNumber?: number | null }>("/api/order/create", {
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
      setDoneTotal(total);
      setOrderId(createdId.current);
      setPhase("done");
      onClearCart();
    } catch (reason) {
      setBusy(false);
      setPhase("form");
      const message = reason instanceof Error ? reason.message : "";
      if (message === "Сервер не ответил.") reportCheckout("SERVER_UNREACHABLE");
      setError(checkoutNotice(message));
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
        <h2 className="empty-title">Заказ успешно оформлен!</h2>
        <p className="empty-text">Заказ: {orderNumber({ displayNumber, orderId })}</p>
        <p className="empty-text">Статус: Ожидает подтверждения</p>
        <p className="empty-text">Курьер: {courier?.name || "Назначенный курьер"}</p>
        <p className="empty-text">Время: {time}</p>
        <p className="empty-text">Сумма: {euro(doneTotal)}</p>
        {noticePending ? <p className="checkout-note">Сообщение курьеру ещё не доставлено. Заказ сохранён.</p> : null}
        <div className="empty-actions">
          {writeHref ? <a className="btn btn-primary empty-cta" href={writeHref} target="_blank" rel="noreferrer">💬 Написать курьеру</a> : null}
          <button type="button" className="btn btn-ghost empty-cta" onClick={onOrders}>📦 Мои заказы</button>
          <button type="button" className="btn btn-ghost empty-cta" onClick={onHome || onCatalog}>🏠 На главную</button>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        variant="cart"
        title="Корзина пуста"
        description="Сначала выберите товары."
        primaryAction={{ label: "В каталог", onClick: onCatalog }}
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
        <h2 className="empty-title">Оформляем</h2>
        <p className="empty-text">Резерв, подтверждение и запись оплаты.</p>
      </div>
    );
  }

  return (
    <div className="checkout-page order-sheet">
      {onClose ? (
        <div className="sheet-head">
          <span className="sheet-grip" aria-hidden="true" />
          <button type="button" className="sheet-close" onClick={onClose}>Закрыть</button>
        </div>
      ) : null}
      <div className="checkout-scroll">
        <div className="order-seg" role="group" aria-label="Способ получения">
          <button type="button" className={fulfillment === "pickup" ? "is-on" : ""} onClick={() => { setFulfillment("pickup"); setError(null); }}>Самовывоз</button>
          <button type="button" className={fulfillment === "delivery" ? "is-on" : ""} onClick={() => { setFulfillment("delivery"); setError(null); }}>Доставка</button>
        </div>
        <div className="checkout-card">
          {lines.map((line) => (
            <div className="checkout-line" key={line.variant.id}>
              <span>{cartTitle(line.product, line.variant)}</span>
              <strong>{line.qty}</strong>
            </div>
          ))}
        </div>
        {authPhase === "initializing" ? <p className="cart-caption">Подтверждаем Telegram.</p> : null}
        {user.tgId && !signedOut ? (
          <div className="facts">
            <div className="fact"><span>Telegram ID</span><strong>{user.tgId}</strong></div>
          </div>
        ) : authPhase === "initializing" ? null : (
          <p className="checkout-note">{authPhase === "expired" || authPhase === "error" || authFailed ? "Не удалось подтвердить вход через Telegram. Откройте приложение заново." : "Откройте магазин через Telegram, чтобы подтвердить заказ."}{botUrl ? <> <a href={botUrl}>Открыть через Telegram</a></> : null}</p>
        )}
        <label className="order-field">
          <span>Курьер</span>
          <select value={courierId} onChange={(event) => chooseCourier(event.target.value)}>
            <option value="">Выберите курьера</option>
            {couriers.map((item) => (
              <option key={item.courier_id} value={item.courier_id}>{item.name} · {item.time_from}–{item.time_to}</option>
            ))}
          </select>
        </label>
        <label className="order-field">
          <span>Время</span>
          <select value={time} onChange={(event) => setTime(event.target.value)} disabled={!courier}>
            <option value="">{courier ? "Время" : "Сначала курьер"}</option>
            {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
          </select>
        </label>
      </div>
      <div className="order-dock">
        <p className="checkout-error" role={error ? "alert" : undefined}>{error ?? ""}</p>
        <div className="pay-row" role="group" aria-label="Оплата">
          <button type="button" className={payment === "cash" ? "pay-tile is-on" : "pay-tile"} aria-pressed={payment === "cash"} disabled={!payments.includes("cash")} onClick={() => setPayment("cash")}>
            {payment === "cash" ? <svg className="pay-check" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.2 6.2 11.5 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg> : null}
            Наличные
          </button>
          <button type="button" className="pay-tile" disabled title="Карта при получении пока недоступна">Карта при получении</button>
          <button type="button" className="pay-tile" disabled title="Другой способ пока недоступен">Другое</button>
        </div>
        <p className="cart-caption">Сейчас доступны только наличные при встрече. Карта и другие способы не подключены.</p>
        <div className="order-sum">
          <span>Товары</span>
          <strong>{euro(total)}</strong>
          <span>Получение</span>
          <strong>{fulfillment === "pickup" ? "Самовывоз" : "Доставка"}</strong>
          <span className="is-total">Итого</span>
          <strong className="is-total">{euro(total)}</strong>
        </div>
        <motion.button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={busy}
          whileTap={reduce || busy ? undefined : { scale: 0.97 }}
          transition={tapSpring}
        >
          Подтвердить заказ
        </motion.button>
      </div>
    </div>
  );
}

function checkoutNotice(message: string) {
  if (message === "ORDERS_NEED_DATABASE") return "Оформление тестовых заказов пока недоступно.";
  if (message === "Выберите курьера" || message === "Выберите время" || message === "Укажите адрес" || message === "Укажите точку встречи") return message.endsWith(".") ? message : `${message}.`;
  if (message === "Этот способ оплаты недоступен.") return message;
  return "Заказ не удалось сохранить. Попробуйте ещё раз.";
}
