import { useEffect, useState } from "react";
import { api, type ApiCourier, type ApiOrder } from "./api";
import { moneyLocale, useI18n } from "./i18n";
import { courierChatLink } from "./telegram";
import { EmptyState } from "./EmptyState";
import { positionWord } from "./orders";
import { customerHandle, formatLine, orderNumber } from "./lineLabel";
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
  const { t, lang } = useI18n();
  const money = moneyLocale(lang);
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
        <button type="button" className="btn btn-primary empty-cta" onClick={() => setReload((value) => value + 1)}>{t("orders.retry")}</button>
      </div>
    );
  }
  if (!orders) {
    return (
      <div className="empty-state">
        <h2 className="empty-title">{t("orders.title")}</h2>
        <p className="empty-text">{t("orders.loading")}</p>
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        variant="orders"
        title={t("orders.empty")}
        description={t("orders.emptyText")}
        primaryAction={{ label: t("orders.openCatalog"), onClick: onCatalog }}
      />
    );
  }
  return (
    <div className="order-list">
      {orders.map((order) => {
        const open = openId === order.orderId;
        const courier = couriers.find((item) => item.courier_id === order.courierId);
        const method = order.deliveryMethod === "pickup" ? t("checkout.pickup") : order.deliveryMethod === "courier" ? t("checkout.delivery") : "";
        return (
          <article key={order.orderId} className="order-card">
            <button type="button" className="order-head" aria-expanded={open} onClick={() => setOpenId(open ? null : order.orderId)}>
              <h2>{t("orders.order", { id: orderNumber(order) })}</h2>
              <span className={`order-status is-${order.status}`}>{t(`status.${order.status}`)}</span>
            </button>
            <p>{order.handle || customerHandle(order.username)}</p>
            <p>{order.lines.length} {positionWord(order.lines.length, lang)}, {order.units} {t("orders.pieces")} · {euro(order.finalAmount ?? order.totalAmount, money)}</p>
            <p>{order.time || t("orders.noTime")}</p>
            {order.place ? <p>{method || t("checkout.fulfillment")} · {order.place}</p> : null}
            <button
              type="button"
              className="btn btn-ghost choice-btn"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : order.orderId)}
            >
              {open ? t("orders.hide") : t("orders.more")}
            </button>
            {open ? (
              <div>
                <ul className="order-items">
                  {order.lines.map((line) => (
                    <li key={`${line.brand || ""}-${line.name}-${line.variant}`}>{line.text || formatLine(line).text}</li>
                  ))}
                </ul>
                <p>{t("orders.total", { sum: euro(order.finalAmount ?? order.totalAmount, money) })}</p>
                <p>{[order.date, order.time].filter(Boolean).join(" ") || t("orders.noTime")}</p>
                {method ? <p>{method}</p> : null}
                {order.courierId ? <p>{t("orders.courier", { name: courier?.name || order.courierId })}</p> : null}
                {["pending", "assigned", "picked_up", "buffer"].includes(order.status) && courierChatLink(order.writeCourier, botUrl) ? (
                  <a className="btn btn-ghost choice-btn" href={courierChatLink(order.writeCourier, botUrl)} target="_blank" rel="noreferrer">{t("checkout.write")}</a>
                ) : null}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
