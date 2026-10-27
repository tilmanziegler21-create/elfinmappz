# Render

Сервис: https://elfinmappz.onrender.com. Один Web Service, фронт и API с одного адреса.

Проверено 27 октября 2026, до деплоя этой ревизии:

| Запрос | Результат |
| --- | --- |
| GET / | 200, Mini App |
| GET /api/health | HH, sheets, writes false |
| GET /api/ready | sheets ready, database ephemeral, telegram configured |
| GET /api/catalog | 104 товара |
| GET /api/couriers | пустой список |
| Сборка фронта на сервисе | отдаётся `index-B3JKoIjk.js` ревизии с группировкой вкусов и оформлением |

До деплоя сервер отвечал кодом ревизии `5f19763`: заказ без сессии получал 401. После пуша `1e5f79a` тот же запрос стал 503 `ORDERS_NEED_DATABASE`. `GET /`, `/api/health` и `/api/ready` после этого деплоя по-прежнему отвечают, база остаётся `ephemeral`.

JWT на Render задан: запрос заказа без сессии не пишет «JWT secret is not configured». Само значение не запрашивалось и не печаталось.

`npm audit`: 0. `body-parser`: 2.4.0.

Постоянный диск и PostgreSQL не подключены. Файл `data/*.json` на бесплатном Render не переживает новый деплой.
