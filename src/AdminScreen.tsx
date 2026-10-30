import { useEffect, useState } from "react";
import { api, customerStatus, type ApiOrder } from "./api";
import { orderNumber } from "./lineLabel";

const nextStep: Record<string, { status: string; label: string } | undefined> = {
  pending: { status: "assigned", label: "Назначить курьера" },
  assigned: { status: "picked_up", label: "В пути" },
  picked_up: { status: "delivered", label: "Доставлено" },
};

export function AdminScreen({ token, city }: { token: string; city: string }) {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    return api<{ orders: ApiOrder[] }>(`/api/admin/orders?city=${encodeURIComponent(city)}`, { token })
      .then((data) => setOrders(data.orders))
      .catch((reason: Error) => setError(reason.message));
  }

  useEffect(() => {
    let alive = true;
    api<{ orders: ApiOrder[] }>(`/api/admin/orders?city=${encodeURIComponent(city)}`, { token })
      .then((data) => {
        if (alive) setOrders(data.orders);
      })
      .catch((reason: Error) => {
        if (alive) setError(reason.message);
      });
    return () => {
      alive = false;
    };
  }, [token, city]);

  async function setStatus(orderId: string, status: string) {
    if (busyId) return;
    setBusyId(orderId);
    setError(null);
    try {
      await api("/api/admin/orders/status", { method: "POST", token, body: { city, orderId, status } });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка запроса");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="order-list">
      {error ? <p className="checkout-error" role="alert">{error}</p> : null}
      {orders.length === 0 ? <p className="empty-text">Заказов нет.</p> : null}
      {orders.map((order) => {
        const step = nextStep[order.status];
        const canCancel = order.status === "pending" || order.status === "assigned";
        return (
          <article key={order.orderId} className="order-card">
            <div className="order-head">
              <h2>Заказ {orderNumber(order)}</h2>
              <p className="cart-caption">{order.orderId}</p>
              <span className={`order-status is-${order.status}`}>{customerStatus[order.status] || order.status}</span>
            </div>
            <p>{order.place || "Без адреса"} · {order.time || "без времени"}</p>
            <div className="choice-row">
              {step ? <button type="button" className="btn btn-primary choice-btn" disabled={busyId === order.orderId} onClick={() => setStatus(order.orderId, step.status)}>{busyId === order.orderId ? "Сохраняем" : step.label}</button> : null}
              {canCancel ? <button type="button" className="btn btn-ghost choice-btn" disabled={busyId === order.orderId} onClick={() => setStatus(order.orderId, "cancelled")}>Отменить</button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
