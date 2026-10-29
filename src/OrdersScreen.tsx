import { useEffect, useState } from "react";
import { api, customerStatus, type ApiCourier, type ApiOrder } from "./api";
import { courierChatLink } from "./telegram";
import { EmptyState } from "./EmptyState";
import { positionWord } from "./orders";
import { euro } from "./products";

export function OrdersScreen({
  token,
  city,
  onCatalog,
  couriers = [],
  botUrl = null,
}: {
  token: string;
  city: string;
  onCatalog: () => void;
  couriers?: ApiCourier[];
  botUrl?: string | null;
}) {
  const [orders, setOrders] = useState<ApiOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    setOrders(null);
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
  }, [token, city, reload]);

  if (error) {
    return (
      <div className="empty-state">
        <p className="checkout-error" role="alert">{error}</p>
        <button type="button" className="btn btn-primary empty-cta" onClick={() => setReload((value) => value + 1)}>Повторить</button>
      </div>
    );
  }
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
      {orders.map((order) => {
        const open = openId === order.orderId;
        const courier = couriers.find((item) => item.courier_id === order.courierId);
        const method = order.deliveryMethod === "pickup" ? "Самовывоз" : order.deliveryMethod === "courier" ? "Доставка" : "";
        return (
          <article key={order.orderId} className="order-card">
            <div className="order-head">
              <h2>Заказ {order.orderId}</h2>
              <span className={`order-status is-${order.status}`}>{customerStatus[order.status] || order.status}</span>
            </div>
            <p>{order.lines.length} {positionWord(order.lines.length)}, {order.units} шт. · {euro(order.finalAmount ?? order.totalAmount)}</p>
            <p>{order.time || "Время не выбрано"}</p>
            {order.place ? <p>{method || "Получение"} · {order.place}</p> : null}
            <button
              type="button"
              className="btn btn-ghost choice-btn"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : order.orderId)}
            >
              {open ? "Скрыть" : "Подробнее"}
            </button>
            {open ? (
              <div>
                <ul className="order-items">
                  {order.lines.map((line) => (
                    <li key={`${line.name}-${line.variant}`}>{line.name} · {line.variant} · {line.qty}</li>
                  ))}
                </ul>
                <p>Итого {euro(order.finalAmount ?? order.totalAmount)}</p>
                <p>{[order.date, order.time].filter(Boolean).join(" ") || "Время не выбрано"}</p>
                {method ? <p>{method}</p> : null}
                {order.courierId ? <p>Курьер {courier?.name || order.courierId}</p> : null}
                {["pending", "assigned", "picked_up", "buffer"].includes(order.status) && courierChatLink(order.writeCourier, botUrl) ? (
                  <a className="btn btn-ghost choice-btn" href={courierChatLink(order.writeCourier, botUrl)} target="_blank" rel="noreferrer">💬 Написать курьеру</a>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
