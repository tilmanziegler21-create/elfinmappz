import { useEffect, useState } from "react";
import { api, type ApiOrder } from "./api";

const levels = [
  { step: 1, value: "0%" },
  { step: 2, value: "−5%" },
  { step: 3, value: "−10%" },
  { step: 4, value: "−15%" },
  { step: 5, value: "0%" },
  { step: 6, value: "−5%" },
  { step: 7, value: "−10%" },
  { step: 8, value: "−15%" },
  { step: 9, value: "−20%" },
  { step: 10, value: "VIP" },
];

const purchaseName = [
  "Первая",
  "Вторая",
  "Третья",
  "Четвёртая",
  "Пятая",
  "Шестая",
  "Седьмая",
  "Восьмая",
  "Девятая",
  "Десятая",
];

function activeStep(delivered: number) {
  return Math.min(10, delivered + 1);
}

export function LoyaltyProgress({ token, city }: { token: string | null; city: string }) {
  const [done, setDone] = useState<number | null>(token ? null : 0);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api<{ orders: ApiOrder[] }>(`/api/order/history?city=${encodeURIComponent(city)}`, { token })
      .then((data) => {
        if (!alive) return;
        const delivered = data.orders.filter((order) => order.status === "delivered").length;
        setDone(delivered);
      })
      .catch(() => {
        if (alive) setDone(0);
      });
    return () => {
      alive = false;
    };
  }, [token, city]);

  const current = done === null ? 0 : activeStep(done);

  return (
    <section className="loyalty" aria-label="Уровень покупателя">
      <h2>Уровень покупателя</h2>
      <p className="loyalty-now">
        {current ? `${purchaseName[current - 1]} покупка · ${current} из 10` : "Считаем выданные заказы"}
      </p>
      <div className="loyalty-grid">
        {levels.map((level) => {
          const state = current === level.step ? "is-now" : "";
          return (
            <span key={level.step} className={state ? `loyalty-cell ${state}` : "loyalty-cell"} style={{ ["--i" as string]: level.step }}>
              <strong>{level.value}</strong>
              <small>{level.step}</small>
            </span>
          );
        })}
      </div>
      <p className="loyalty-vip">Демонстрация уровней, без действующих скидок</p>
    </section>
  );
}
