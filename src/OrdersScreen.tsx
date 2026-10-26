import { useEffect, useState } from "react";
import { api, customerStatus, type ApiOrder } from "./api";
import { EmptyState } from "./EmptyState";
import { positionWord } from "./orders";
import { euro } from "./products";

export function OrdersScreen({
  token,
  city,
  onCatalog,
}: {
  token: string;
  city: string;
  onCatalog: () => void;
}) {
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ orders: ApiOrder[] }>(`/api/order/history?city=${encodeURIComponent(city)}`, { token })
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

  if (error) return <p className="checkout-error">{error}</p>;
  if (!orders) {
    return (
      <div className="empty-state">
        <h2 className="empty-title">Заказы</h2>
        <p className="empty-text">Загружаем историю.</p>
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        variant="orders"
        title="Заказов пока нет"
        description="История заказов появится здесь после первого оформления."
        primaryAction={{ label: "Открыть каталог", onClick: onCatalog }}
      />
    );
  }
  return (
    <div className="order-list">
      {orders.map((order) => (
        <article key={order.orderId} className="order-card">
          <div className="order-head">
            <h2>Заказ {order.orderId}</h2>
            <span className={`order-status is-${order.status}`}>{customerStatus[order.status] || order.status}</span>
          </div>
          <p>{order.lines.length} {positionWord(order.lines.length)}, {order.units} шт. · {euro(order.finalAmount ?? order.totalAmount)}</p>
          <p>{order.time || "Время не выбрано"}</p>
          {order.place ? <p>{order.deliveryMethod === "pickup" ? "Самовывоз" : "Доставка"} · {order.place}</p> : null}
        </article>
      ))}
    </div>
  );
}
