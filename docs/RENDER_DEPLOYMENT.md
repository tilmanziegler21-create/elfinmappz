# Деплой ELFIN Market на Render

Реальный деплой не выполнялся. Город HH / Hamburg. Запись в Google Sheets выключена. Дизайн не менялся.

Репозиторий `elfinmappz` уже содержит приложение в корне, поэтому Root Directory в Render оставляйте пустым. Если подключить родительский каталог `ELF`, укажите Root Directory `elfin-market`.

В Git не должны попасть `.env`, токен и `google-service.json`.

## Сервис

Один Web Service. Vite dev server на Render не запускается. Express отдаёт собранный `dist` на `/` и API на `/api`.

| Сервис | Тип | Команда |
| --- | --- | --- |
| `elfin-market` | Web Service, Node, Frankfurt | Build: `npm ci --include=dev && npm run build` |
| | | Start: `npm run start:api` |
| | | Health: `/api/health` |

`build:api` только проверяет синтаксис `server/index.js`. `build:frontend` — `tsc --noEmit` и `vite build`. Node в `package.json`: `22.x`.

API слушает `process.env.PORT` на `0.0.0.0`. Локальный запасной порт — `8787`.

## Переменные backend

Задать в Dashboard. Секреты в `render.yaml` не записаны.

| Имя | Значение |
| --- | --- |
| `NODE_ENV` | `production` |
| `CITY_CODE` | `HH` |
| `CITY_NAME` | `Hamburg` |
| `BOT_MODE` | `webhook` |
| `TELEGRAM_POLLING` | `0` |
| `SHEETS_READ_ONLY` | `true` |
| `ENABLE_LIVE_WRITES` | `false` |
| `ENABLE_LIVE_ORDERS` | `false` |
| `TELEGRAM_TEST_MODE` | `true` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` из JSON-ключа |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` из JSON-ключа, с `BEGIN` и `END` |
| `GOOGLE_APPLICATION_CREDENTIALS` | не задавать, если email и private key уже есть |
| `MINIAPP_PUBLIC_URL` | `https://` адрес этого же Web Service |
| `PUBLIC_API_URL` | тот же `https://` адрес, без `/` в конце |
| `DATABASE_URL` | внутренний URL PostgreSQL Render. Без него заказы отвечают `503` |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID книги Hamburg, не книги «Muenchen» |
| `TELEGRAM_BOT_TOKEN` | новый токен из BotFather `/token` |
| `TELEGRAM_WEBHOOK_SECRET` | отдельная случайная строка |
| `JWT_SECRET` | отдельная случайная строка |
| `TELEGRAM_TEST_IDS` | свой Telegram id, пока тестовый режим включён |

JSON-файл на Render не обязателен. Если email и private key заданы, сервер их и использует. Secret File `google-service.json` нужен только как запасной путь, когда обеих переменных нет. Ключ не копировать в `dist` и не коммитить.

## Frontend

Отдельный URL для frontend не нужен. `VITE_API_BASE_URL` оставляйте пустым: Mini App ходит на относительный `/api`. В production localhost не подставляется.

Навигация идёт через hash (`#product/...`, `#/courier`). Отдельный rewrite History API не нужен.

## Telegram

Polling в production не запускается, даже если `TELEGRAM_POLLING=1`. События принимает `POST /api/telegram/webhook`. Заголовок `X-Telegram-Bot-Api-Secret-Token` сверяется с `TELEGRAM_WEBHOOK_SECRET`. Повторный `update_id` не обрабатывается второй раз. Pending updates сами не удаляются.

После валидного `getMe`:

```
npm run telegram:webhook:setup
```

Скрипт проверяет `getMe`, требует `https://` у `PUBLIC_API_URL`, вызывает `setWebhook` с `secret_token` и сверяет `getWebhookInfo`. Токен в вывод не попадает. При `401` webhook не ставится: в BotFather нужен `/token`.

Кнопка Mini App берёт только `https://` из `MINIAPP_PUBLIC_URL`. Её можно продублировать в BotFather.

## Google Sheets

Книга «Muenchen» с вкладками `*_MU` не является источником Hamburg. Пока нет `products_HH`, `LiquidPrices_HH`, `couriers_HH`, `orders_HH` и `metrics_HH`, каталог отвечает `SHEETS_HH_MISSING` и не подменяется демо-товарами, если `DEMO_CATALOG` не равен `1`. На Render демо-каталог не включайте.

Запись в таблицу кодом не включается.

## Хранение

Локально заказы, пользователи, идемпотентность и уведомления лежат в `data/*.json`. На Render этот диск временный.

Если задан `DATABASE_URL`, при старте сервер создаёт таблицу `elfin_state` и хранит туда тот же снимок. После рестарта снимок читается обратно. Подключение к PostgreSQL в этой среде не проверялось: локальной базы нет.

Пока `DATABASE_URL` пуст, production отклоняет `POST /api/order/create`, `/confirm` и `/payment` с `ORDERS_NEED_DATABASE`. Живые заказы не включаются. Бесплатный сервис засыпает через 15 минут, поэтому интервал очистки резервов не заменяет базу.

## Проверка и откат

`GET /api/health` не ходит в Google. `GET /api/ready` сообщает API, Telegram, вкладки HH, тип диска и `writes: false`. Секреты и пути туда не входят.

Откат: в Render открыть предыдущий успешный деплой и выбрать Rollback. Секреты при этом не меняются.

Если сервис не поднимается, в логе будут только имена пустых переменных, не их значения. `401` у Telegram лечится новым токеном, а не повторным деплоем.
