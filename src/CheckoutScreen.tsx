import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CrystalIllustration } from "./CrystalIllustration";
import { EmptyState } from "./EmptyState";
import { api, todayDate, type ApiCourier, type AuthPhase, type SessionUser } from "./api";
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
  const [customerName, setCustomerName] = useState(user.firstName || "");
  const [contact, setContact] = useState(user.username ? `@${user.username}` : "");
  const courier = couriers.find((item) => item.courier_id === courierId) ?? null;
  const slots = courier?.slots ?? [];
  const [time, setTime] = useState(slots[0] ?? "");
  const [place, setPlace] = useState("");
  const [comment, setComment] = useState("");
  const [payment, setPayment] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "loading" | "done">("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const panel = document.querySelector(".sheet-panel");
    if (!viewport || !(panel instanceof HTMLElement)) return;
    const fit = () => {
      if (viewport.scale > 1) {
        panel.style.maxHeight = "";
        panel.style.marginBottom = "";
        return;
      }
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      panel.style.maxHeight = `${Math.max(320, viewport.height - 28)}px`;
      panel.style.marginBottom = `${keyboard}px`;
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      panel.style.maxHeight = "";
      panel.style.marginBottom = "";
    };
  }, []);

  function chooseCourier(id: string) {
    const next = couriers.find((item) => item.courier_id === id);
    setCourierId(id);
    setTime(next?.slots[0] ?? "");
    if (fulfillment === "pickup" && next?.meeting_place) setPlace(next.meeting_place);
  }

  async function submit() {
    if (busy || phase !== "form") return;
    if (!token || authPhase === "expired" || authPhase === "error") {
      setError(authFailed || authPhase === "expired" || authPhase === "error"
        ? "Не удалось подтвердить вход через Telegram. Откройте приложение заново."
        : "Откройте магазин через Telegram, чтобы подтвердить заказ.");
      return;
    }
    if (!payments.includes(payment)) {
      setError("Этот способ оплаты недоступен.");
      return;
    }
    if (!courier) {
      setError("Выберите курьера.");
      return;
    }
    if (!time) {
      setError("Выберите время.");
      return;
    }
    const meeting = fulfillment === "pickup" ? (courier.meeting_place || "Самовывоз") : place.trim();
    if (fulfillment === "delivery" && meeting.length < 2) {
      setError("Укажите адрес.");
      return;
    }
    setError(null);
    setBusy(true);
    setPhase("loading");
    try {
      if (!createdId.current) {
        const created = await api<{ orderId: string }>("/api/order/create", {
          method: "POST",
          token,
          headers: { "Idempotency-Key": idempotencyKey.current },
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
      }
      if (!confirmed.current) {
        const confirmedBody = await api<{ telegram?: boolean }>("/api/order/confirm", {
          method: "POST",
          token,
          body: {
            orderId: createdId.current,
            city,
            deliveryMethod: fulfillment === "delivery" ? "courier" : "pickup",
            courier_id: courier.courier_id,
            delivery_date: todayDate(),
            delivery_time: time,
            promoCode: "",
            courierData: {
              address: meeting,
              comment,
              user: {
                tgId: user.tgId,
                username: user.username,
                name: (verified ? [user.firstName, user.lastName].filter(Boolean).join(" ") : customerName.trim()),
                contact: verified ? (user.username ? `@${user.username}` : user.tgId) : contact.trim(),
              },
            },
          },
        });
        if (confirmedBody.telegram === false) {
          setBusy(false);
          setPhase("form");
          setError("Telegram не принял заказ.");
          return;
        }
        confirmed.current = true;
      }
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
      setOrderId(createdId.current);
      onClearCart();
      onOrders();
      setPhase("done");
    } catch (reason) {
      setBusy(false);
      setPhase("form");
      const message = reason instanceof Error ? reason.message : "";
      const validation = message === "Выберите время" || message === "Выберите курьера" || message === "Укажите адрес" || message === "Укажите точку встречи";
      setError(message === "ORDERS_NEED_DATABASE"
        ? "Оформление заказов временно недоступно."
        : validation
          ? message
          : "Заказ не удалось сохранить. Попробуйте ещё раз.");
    }
  }

  if (lines.length === 0 && phase !== "done") {
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

  if (phase === "done" && orderId) {
    return (
      <div className="empty-state">
        <div className="empty-crystal">
          <span className="empty-glow" />
          <span className="empty-float">
            <CrystalIllustration variant="orders" />
          </span>
        </div>
        <h2 className="empty-title">Заказ #{orderId}</h2>
        <p className="empty-text">Курьер получил сообщение в Telegram.</p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary empty-cta" onClick={onOrders}>К заказам</button>
        </div>
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
          <button type="button" className={fulfillment === "delivery" ? "is-on" : ""} onClick={() => { setFulfillment("delivery"); setError(null); }}>Адрес</button>
        </div>
        {authPhase === "initializing" ? <p className="cart-caption">Подтверждаем Telegram.</p> : null}
        {verified ? (
          <div className="facts">
            <div className="fact"><span>Ваш Telegram</span><strong>подключён</strong></div>
            <div className="fact"><span>Имя</span><strong>{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Имя не указано"}</strong></div>
            <div className="fact"><span>Username</span><strong>{user.username ? `@${user.username}` : "Username не установлен"}</strong></div>
            <div className="fact"><span>Telegram ID</span><strong>{user.tgId}</strong></div>
          </div>
        ) : authPhase === "initializing" ? null : (
          <div>
            <p className="cart-caption">{authPhase === "expired" || authPhase === "error" || authFailed ? "Не удалось подтвердить вход через Telegram. Откройте приложение заново." : "Откройте магазин через Telegram, чтобы подтвердить заказ."}</p>
            {botUrl ? <a className="btn btn-primary" href={botUrl}>Открыть через Telegram</a> : null}
          </div>
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
        {verified ? null : (
          <>
            <label className="order-field">
              <span>Имя</span>
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Имя" autoComplete="name" />
            </label>
            <label className="order-field">
              <span>Telegram или телефон</span>
              <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="@username или телефон" autoComplete="tel" />
            </label>
          </>
        )}
        <label className="order-field">
          <span>Время</span>
          <select value={time} onChange={(event) => setTime(event.target.value)} disabled={!courier}>
            <option value="">{courier ? "Время" : "Сначала курьер"}</option>
            {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
          </select>
        </label>
        {fulfillment === "delivery" ? (
          <label className="order-field">
            <span>Адрес</span>
            <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="Адрес" autoComplete="street-address" />
          </label>
        ) : null}
        <label className="order-field">
          <span>Комментарий</span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={200} placeholder="Необязательно" />
        </label>
      </div>
      <div className="order-dock">
        {error ? <p className="checkout-error" role="alert">{error}</p> : null}
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
          <strong>{fulfillment === "pickup" ? "Самовывоз" : "Адрес"}</strong>
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
