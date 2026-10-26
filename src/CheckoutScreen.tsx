import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CrystalIllustration } from "./CrystalIllustration";
import { EmptyState } from "./EmptyState";
import { api, todayDate, type ApiCourier, type SessionUser } from "./api";
import { cartEntries, cartMoney, euro } from "./products";
import { tapSpring } from "./motion";

export function CheckoutScreen({
  cart,
  token,
  city,
  user,
  couriers,
  onClearCart,
  onCatalog,
  onOrders,
  onClose,
}: {
  cart: Record<string, number>;
  token: string;
  city: string;
  user: SessionUser;
  couriers: ApiCourier[];
  onClearCart: () => void;
  onCatalog: () => void;
  onOrders: () => void;
  onClose?: () => void;
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
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"form" | "loading" | "done">("form");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lockedPlace = fulfillment === "pickup" && Boolean(courier?.meeting_place);

  useEffect(() => {
    const viewport = window.visualViewport;
    const panel = document.querySelector(".sheet-panel");
    if (!viewport || !(panel instanceof HTMLElement)) return;
    const fit = () => {
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
    if (!courier) {
      setError("Выберите курьера.");
      return;
    }
    if (!time) {
      setError("Выберите время.");
      return;
    }
    const meeting = lockedPlace ? courier.meeting_place : place.trim();
    if (fulfillment === "delivery" && meeting.length < 2) {
      setError("Укажите адрес.");
      return;
    }
    if (fulfillment === "pickup" && meeting.length < 2) {
      setError("Укажите точку встречи.");
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
              productId: line.key,
              quantity: line.qty,
              variant: line.variant.label,
            })),
          },
        });
        createdId.current = created.orderId;
      }
      if (!confirmed.current) {
        await api("/api/order/confirm", {
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
              user: { tgId: user.tgId, username: user.username, name: customerName.trim(), contact: contact.trim() },
            },
          },
        });
        confirmed.current = true;
      }
      await api("/api/order/payment", {
        method: "POST",
        token,
        body: {
          orderId: createdId.current,
          city,
          paymentMethod: "cash",
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
      setError(reason instanceof Error ? reason.message : "Ошибка запроса");
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
        <p className="empty-text">Передан выбранному курьеру. Уведомление записано локально, Telegram не отправлялся.</p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary empty-cta" onClick={onOrders}>К заказам</button>
        </div>
      </div>
    );
  }

  const placeLabel = fulfillment === "delivery" ? "Адрес" : "Точка встречи";

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
          <button type="button" className={fulfillment === "pickup" ? "is-on" : ""} onClick={() => { setFulfillment("pickup"); setError(null); if (courier?.meeting_place) setPlace(courier.meeting_place); }}>Самовывоз</button>
          <button type="button" className={fulfillment === "delivery" ? "is-on" : ""} onClick={() => { setFulfillment("delivery"); setError(null); }}>Доставка</button>
        </div>
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
          <span>Имя</span>
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Имя" autoComplete="name" />
        </label>
        <label className="order-field">
          <span>Telegram или телефон</span>
          <input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="@username или телефон" autoComplete="tel" />
        </label>
        <div className="order-pair">
          <label className="order-field">
            <span>Время</span>
            <select value={time} onChange={(event) => setTime(event.target.value)} disabled={!courier}>
              <option value="">{courier ? "Время" : "Сначала курьер"}</option>
              {slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </label>
          <label className="order-field">
            <span>{placeLabel}</span>
            <input value={lockedPlace ? courier?.meeting_place || "" : place} readOnly={lockedPlace} onChange={(event) => setPlace(event.target.value)} placeholder={placeLabel} />
          </label>
        </div>
        <label className="order-field">
          <span>Комментарий</span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={200} placeholder="Необязательно" />
        </label>
      </div>
      <div className="order-dock">
        {error ? <p className="checkout-error" role="alert">{error}</p> : null}
        <div className="pay-row" role="group" aria-label="Оплата">
          <button type="button" className="pay-tile is-on" aria-pressed="true">Наличные</button>
          <button type="button" className="pay-tile" disabled>Карта</button>
          <button type="button" className="pay-tile" disabled>Крипто</button>
        </div>
        <div className="order-sum">
          <span>Товары</span>
          <strong>{euro(total)}</strong>
          <span>Получение</span>
          <strong>—</strong>
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
