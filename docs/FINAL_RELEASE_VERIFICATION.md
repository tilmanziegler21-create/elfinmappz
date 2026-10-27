# Проверка блокеров

Дата: 27 октября 2026. Адрес: https://elfinmappz.onrender.com.

Статус релиза: **NOT READY**. Реальные заказы не включались. Рабочая таблица не изменялась.

## Поля

| Поле | Статус | Доказательство |
| --- | --- | --- |
| Telegram getMe | FAILED | Локальный `TELEGRAM_BOT_TOKEN` имеет формат BotFather, без пробелов и кавычек, и совпадает с `BOT_TOKEN`. `getMe` вернул 401. Панель Render открывается на странице входа, поэтому отдельный токен сервиса прочитать нельзя. Webhook не ставился. |
| Telegram webhook | BLOCKED | `getWebhookInfo` не вызывался: `getMe` не прошёл. |
| Telegram /start | BLOCKED | Живой чат не открывался. Сообщения не отправлялись. |
| Mini App WebView | BLOCKED | Проверен обычный браузер, не Telegram WebView. iOS и Android не проверялись. |
| Sheets | PASS как чтение демо-книги | `GET /api/health`: город HH, `sheetCode` HG, `warehouseConfirmed` false, `writes` false. Каталог живого сайта показывает товары HG. Это не подтверждённый склад Hamburg и не книга München. Локальный файл окружения читает книгу «Muenchen», вкладки `*_MU`. На Render эта книга не используется. |
| Couriers | PASS | Было `[]`, потому что обе строки `couriers_HG` имели время `16:30:00`–`18:30:00`, а разбор принимал только `ЧЧ:ММ`. После исправления `GET /api/couriers` вернул 2 курьера, `kept: 2`, `issues` пустой, `tg_id` в ответе нет. В оформлении выбираются C-001 и C-002, слоты 16:00 и 17:00. Неактивный курьер по-прежнему отбрасывается: тест `active-only`. |
| PostgreSQL | BLOCKED | `GET /api/ready`: `database: ephemeral`. `DATABASE_URL` в доступном окружении нет. `POST /api/order/create` без сессии отвечает 503 `ORDERS_NEED_DATABASE`. |
| Test order | BLOCKED | Публичный заказ не создавался. Локальные наборы `reliability` 31 и `fixes` 17 проходят на учебной базе процесса, не на Render. |
| Courier delivered | BLOCKED | В Telegram кнопка «Выдал» не нажималась. Локальный тест `deliver-once` проходит на фиктивном боте. |
| Cancellation | BLOCKED на Render | Локально повторная отмена не возвращает склад второй раз. Публичной отмены не было. |
| Inventory reconciliation | BLOCKED | Запись в Google Sheet выключена. Сверка живого заказа с таблицей не выполнялась. |
| Restart persistence | BLOCKED на Render | Локальный тест переживает SIGTERM на диске процесса. На Render постоянного диска и PostgreSQL нет. |
| All buttons | FAILED как полный список | Нажаты: главная, каталог, поиск без результата, вкус ELFLIQ, назад, корзина, оформление, самовывоз, адрес, выбор курьера, заказы, профиль. Курьерская панель, админка и поддержка в Mini App без роли не открываются. Поддержка есть в боте, не отдельным экраном. |
| All animations | BLOCKED | `prefers-reduced-motion` в CSS есть. Частота кадров не измерялась. Дефекта, из-за которого нужно менять анимацию, не найдено. |
| Visual screenshots | PASS частично | Снимки: `artifacts/qa/screenshots/` — home, catalog, product, cart, checkout, orders, profile, пустой поиск на 390; home на 320. Горизонтального переполнения нет на 320, 360, 390 и 430. Клавиатура телефона и safe-area устройства не проверялись. |

## Что исправлено в этой проверке

- Время курьера из Google Sheets вида `16:30:00` приводится к `16:30`. Строки больше не пропадают.
- `GET /api/health` и `GET /api/config` явно говорят `warehouseConfirmed: false` и код листа HG.
- Ответ курьеров содержит счётчики листа без имён в диагностике и без `tg_id`.

## Что остаётся сделать владельцу

1. В BotFather выполнить `/token` и заменить `TELEGRAM_BOT_TOKEN` на Render и локально. Задать `MINIAPP_PUBLIC_URL=https://elfinmappz.onrender.com`.
2. Подключить PostgreSQL и записать `DATABASE_URL` в окружение Render. Пока его нет, заказ на сайте не создаётся.
3. После этого пройти заказ только на `TELEGRAM_TEST_IDS`, в тестовой базе. В рабочую таблицу не писать.

Пока `getMe`, PostgreSQL и сквозной заказ не подтверждены, статус остаётся NOT READY.
