# Подключение существующих доступов

Дата: 26 октября 2026. Публичный запуск не выполнялся. Секреты в этот файл не записывались. Дизайн, товары и цены не менялись.

| Сервис | Статус | Причина |
| --- | --- | --- |
| Telegram `getMe` | FAILED | `TELEGRAM_BOT_TOKEN` и `BOT_TOKEN` — один и тот же токен. Пробелов и кавычек нет, формат BotFather верный. Telegram ответил `401 Unauthorized`. Файл окружения не перезаписал `process.env`: сейчас токен взят из файла, потому что в процессе его не было. |
| Google Auth | PASS | JWT из `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Файл ключа не использовался. `spreadsheets.get` вернул метаданные. |
| Google Sheets HH | FAILED | Та же книга «Muenchen», хвост `_QkzM0`. Вкладок `*_HH` нет, поэтому `products_HH`, `LiquidPrices_HH` и `couriers_HH` не читались. Запись не выполнялась. |
| Mini App HTTPS | FAILED | `MINIAPP_PUBLIC_URL` и `PUBLIC_API_URL` пусты. Webhook не ставился. |
| Тестовая таблица | FAILED | `SHEETS_TEST_SPREADSHEET_ID` не задан. Тестовый заказ в Google не запускался. |
| PostgreSQL | NOT VERIFIED | Код готов читать и писать снимок в `elfin_state`, если задан `DATABASE_URL`. Локальной базы нет, рестарт с сохранением не проверялся. |
| Запись в рабочую таблицу | DISABLED | `SHEETS_MODE=READ_ONLY`, `ENABLE_LIVE_WRITES=false`. |
| Локальный один сервис | PASS | `npm run build` и `npm run check:render`: `GET /` отдаёт Mini App, `GET /api/health` отвечает, заказ без базы в production получает `503`. |
| Render | NOT DEPLOYED | Blueprint — один Web Service. На Render он не создавался. |

## Что сделать в Render

1. В BotFather у существующего бота выполнить `/token` и заменить `TELEGRAM_BOT_TOKEN` во внешнем окружении. Старый токен Telegram не принимает.
2. В URL таблицы Hamburg взять фрагмент между `/d/` и `/edit` и записать его в `GOOGLE_SHEETS_SPREADSHEET_ID`. Сервисному аккаунту дать Viewer. Книгу «Muenchen» не использовать как HH.
3. Создать один Web Service из репозитория `elfinmappz`. Root Directory пустой. Если подключён родительский каталог `ELF`, Root Directory — `elfin-market`.
4. Build: `npm ci --include=dev && npm run build`. Start: `npm run start:api`. Health: `/api/health`.
5. В Environment задать `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. JSON-файл нужен только если обеих переменных нет.
6. После появления HTTPS записать этот адрес в `MINIAPP_PUBLIC_URL` и `PUBLIC_API_URL`. `VITE_API_BASE_URL` не задавать: фронтенд ходит на `/api`.
7. Добавить PostgreSQL и его внутренний URL в `DATABASE_URL`. Пока переменная пуста, создание, подтверждение и оплата заказа в production отвечают `ORDERS_NEED_DATABASE`.
8. Когда `getMe` вернёт ok и оба URL будут `https://`, выполнить `npm run telegram:webhook:setup`.
