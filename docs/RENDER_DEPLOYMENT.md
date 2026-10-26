# Деплой ELFIN Market на Render

Реальный деплой не выполнялся. Город HH / Hamburg. Запись в Google Sheets выключена. Дизайн не менялся.

Сейчас git-корень — родительский каталог `ELF`, а `render.yaml` лежит в `elfin-market`. Для Blueprint нужен репозиторий, в корне которого находится этот файл. Либо публикуйте `elfin-market` отдельным приватным репозиторием, либо в Dashboard укажите Root Directory `elfin-market`.

В Git не должны попасть `.env`, токен и `google-service.json`.

## Сервисы

Оба из одного репозитория. Vite dev server на Render не запускается.

| Сервис | Тип | Команда |
| --- | --- | --- |
| `elfin-market-api` | Web Service, Node, Frankfurt | Build: `npm ci && npm run build:api` |
| | | Start: `npm run start:api` |
| | | Health: `/api/health` |
| `elfin-market-frontend` | Static Site | Build: `npm ci --include=dev && npm run build:frontend` |
| | | Каталог: `dist` |

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
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/google-service.json` |
| `MINIAPP_PUBLIC_URL` | `https://` адрес Static Site |
| `PUBLIC_API_URL` | `https://` адрес Web Service, без `/` в конце |
| `FRONTEND_ORIGIN` | тот же origin, что у Static Site |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID книги Hamburg, не книги «Muenchen» |
| `TELEGRAM_BOT_TOKEN` | новый токен из BotFather `/token` |
| `TELEGRAM_WEBHOOK_SECRET` | отдельная случайная строка |
| `JWT_SECRET` | отдельная случайная строка |
| `TELEGRAM_TEST_IDS` | свой Telegram id, пока тестовый режим включён |

Secret File в Render: имя `google-service.json`. Это даёт путь `/etc/secrets/google-service.json`. Ключ не копировать в `dist` и не коммитить.

## Переменная frontend

`VITE_API_BASE_URL` нужна на этапе сборки Static Site. Значение — публичный `https://` API, без завершающего слэша. Пустое значение оставляет относительный `/api` и годится только для локального Vite proxy. В production localhost не подставляется.

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

Заказы, пользователи, резервы, уведомления и журнал склада пишутся в `data/state.json`, `data/workbook.json` и `data/checkpoint.json`. На бесплатном Web Service этот диск временный: после деплоя и рестарта файлы пропадают. `setInterval` очистки резервов тоже не является надёжным планировщиком: бесплатный сервис засыпает через 15 минут без запросов.

Два рабочих варианта, бизнес-логика пока не переписывалась:

1. Платный Web Service и persistent disk. Точку монтирования задать в `DATA_DIR` и в `RENDER_DISK_MOUNT`.
2. Отдельный PostgreSQL. Это уже смена хранилища, её нельзя делать без копии текущих файлов.

Пока диск временный, новые заказы на Render не переживут рестарт. Идемпотентность хранится в том же файле и тоже пропадает вместе с ним. После старта сервер один раз дочищает просроченные резервы и незакрытые складские шаги, если файл ещё на месте.

## Проверка и откат

`GET /api/health` не ходит в Google. `GET /api/ready` сообщает API, Telegram, вкладки HH, тип диска и `writes: false`. Секреты и пути туда не входят.

Откат: в Render открыть предыдущий успешный деплой и выбрать Rollback. Секреты при этом не меняются.

Если сервис не поднимается, в логе будут только имена пустых переменных, не их значения. `401` у Telegram лечится новым токеном, а не повторным деплоем.
