import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { api, askTelegram, courierStatus, type ApiOrder } from "./api";
import { positionWord } from "./orders";
import { euro } from "./products";
import { tapSpring } from "./motion";

export function CourierScreen({ token, city }: { token: string; city: string }) {
  const reduce = useReducedMotion();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; action: "delivered" | "cancelled" } | null>(null);
  const [reason, setReason] = useState("");

  function load() {
    return api<{ orders: ApiOrder[] }>(`/api/courier/orders?city=${encodeURIComponent(city)}`, { token })
      .then((data) => setOrders(data.orders))
      .catch((reasonError: Error) => setError(reasonError.message));
  }

  useEffect(() => {
    let alive = true;
    api<{ orders: ApiOrder[] }>(`/api/courier/orders?city=${encodeURIComponent(city)}`, { token })
      .then((data) => {
        if (alive) setOrders(data.orders);
      })
      .catch((reasonError: Error) => {
        if (alive) setError(reasonError.message);
      });
    return () => {
      alive = false;
    };
  }, [token, city]);

  async function start(id: string, action: "delivered" | "cancelled") {
    const telegram = await askTelegram(action === "delivered" ? `Подтвердить выдачу ${id}?` : `Отменить выдачу ${id}?`);
    if (telegram === false) return;
    if (telegram === true && action === "delivered") {
      try {
        await api("/api/courier/orders/status", { method: "POST", token, body: { city, orderId: id, status: "delivered" } });
        await load();
      } catch (reasonError) {
        setError(reasonError instanceof Error ? reasonError.message : "Ошибка запроса");
      }
      return;
    }
    setPending({ id, action });
    setReason("");
    setError(null);
  }

  async function confirm() {
    if (!pending) return;
    try {
      await api("/api/courier/orders/status", {
        method: "POST",
        token,
        body: {
          city,
          orderId: pending.id,
          status: pending.action,
          reason: pending.action === "cancelled" ? reason : undefined,
        },
      });
      setPending(null);
      setReason("");
      await load();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "Ошибка запроса");
    }
  }

  return (
    <div className="checkout-page">
      {error ? <p className="checkout-error" role="alert">{error}</p> : null}
      {orders.length === 0 ? <p className="empty-text">Назначенных заказов нет.</p> : null}
      <div className="order-list">
        {orders.map((order) => {
          const open = order.status === "pending" || order.status === "assigned" || order.status === "picked_up";
          const amount = order.finalAmount ?? order.totalAmount;
          return (
            <article key={order.orderId} className="order-card">
              <div className="order-head">
                <h2>Заказ {order.orderId}</h2>
                <span className={`order-status is-${order.status}`}>{courierStatus[order.status] || order.status}</span>
              </div>
              <dl className="order-facts">
                <div><dt>Покупатель</dt><dd>{order.customerName || "Клиент Telegram"}</dd></div>
                <div><dt>Username</dt><dd>{order.username ? `@${order.username}` : "нет"}</dd></div>
                <div><dt>Telegram ID</dt><dd>{order.tgId}</dd></div>
                <div><dt>Телефон</dt><dd>{order.phone || "нет"}</dd></div>
                <div><dt>Сумма</dt><dd>{euro(amount)}</dd></div>
                <div><dt>Выплата</dt><dd>{euro(order.payout || 0)}</dd></div>
                <div><dt>Товары</dt><dd>{order.lines.length} {positionWord(order.lines.length)}, {order.units} шт.</dd></div>
                <div><dt>Время</dt><dd>{order.date} {order.time}</dd></div>
                <div><dt>{order.deliveryMethod === "pickup" ? "Место" : "Адрес"}</dt><dd>{order.place}</dd></div>
                {order.comment ? <div><dt>Комментарий</dt><dd>{order.comment}</dd></div> : null}
              </dl>
              <ul className="order-items">
                {order.lines.map((line) => (
                  <li key={`${line.name}-${line.variant}`}>{line.name} · {line.variant} · {line.qty}</li>
                ))}
              </ul>
              {open ? (
                <div className="choice-row">
                  <button type="button" className="btn btn-primary choice-btn" onClick={() => start(order.orderId, "delivered")}>Выдал</button>
                  <button type="button" className="btn btn-ghost choice-btn" onClick={() => start(order.orderId, "cancelled")}>Не выдал</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {pending ? createPortal(
        <div className="confirm-layer" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirm-card">
            <h2 id="confirm-title">{pending.action === "delivered" ? "Подтвердить выдачу?" : "Отменить выдачу?"}</h2>
            <p>Заказ {pending.id}. Покупатель ничего не подтверждает.</p>
            {pending.action === "cancelled" ? (
              <label className="checkout-field">
                <span>Причина</span>
                <textarea value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} rows={3} />
              </label>
            ) : null}
            <div className="choice-row">
              <motion.button type="button" className="btn btn-primary choice-btn" onClick={confirm} whileTap={reduce ? undefined : { scale: 0.97 }} transition={tapSpring}>
                Подтвердить
              </motion.button>
              <button type="button" className="btn btn-ghost choice-btn" onClick={() => setPending(null)}>Назад</button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
