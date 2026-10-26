# Инфраструктура ELFIN Market

Дата: 26 октября 2026. Город по-прежнему HH / Hamburg. Дизайн и оформление заказа не менялись.

| Проверка | Статус |
| --- | --- |
| Telegram | FAILED |
| Sheets HH | FAILED |
| Mini App HTTPS | FAILED |
| Test writes | NOT VERIFIED |
| Production writes | DISABLED |

К эксплуатации не готово. `/start` в Telegram, каталог HH и тестовый заказ не выполнялись.

## Таблица

Ключ читает книгу с названием «Muenchen». Хвост `GOOGLE_SHEETS_SPREADSHEET_ID` — `_QkzM0`. Вкладки только `products_MU`, `LiquidPrices_MU`, `couriers_MU`, `orders_MU`, `metrics_MU`. Это не файл Hamburg, у которого не хватает листов.

Что сделать: открыть таблицу Hamburg, скопировать из URL фрагмент между `/d/` и `/edit`, записать его в `GOOGLE_SHEETS_SPREADSHEET_ID` во внешнем окружении и выдать сервисному аккаунту роль Viewer. Вкладки MU не переименовывались и как склад Hamburg не читались.

`npm run check:sheets` завершается с ошибкой, пока HH нет. Запись не выполняется.

`npm run setup:hh-tabs` без флагов только печатает план пустых заголовков. `--confirm` на книге «Muenchen» отклонён и вкладок не создаёт. Создавать HH внутри мюнхенской книги не нужно.

## Telegram

Токен в окружении есть, пробелов и кавычек нет, формат похож на токен BotFather. `getMe` вернул `401 Unauthorized`. Polling не включался. Webhook из-за отказа `getMe` не проверялся.

Нужен новый токен: BotFather, свой бот, команда `/token`. Старое значение в `TELEGRAM_BOT_TOKEN` заменить локально и перезапустить API. Пока `npm run check:telegram` не напечатает `getMe ok` и имя бота, `TELEGRAM_POLLING` не ставить в `1`.

Локальный API один. Это не второй бот.

## Mini App

`MINIAPP_PUBLIC_URL` и `PUBLIC_API_URL` пусты. Localhost в кнопку WebApp не подставляется. `dist/index.html` есть. Локальный `127.0.0.1:8787/api/health` отвечает, это не публичный адрес. `npm run check:miniapp` из-за пустых URL завершается с ошибкой.

Когда появится HTTPS, CORS разрешает только origin из `MINIAPP_PUBLIC_URL`. Подпись `initData` проверяет уже существующий `POST /api/auth/telegram`.

## Как выложить

Один домен проще двух. Сайт отдаёт `dist/`, а `/api` проксируется на Node `127.0.0.1:8787`. Тогда оба адреса одинаковые и начинаются с `https://`.

```
MINIAPP_PUBLIC_URL=https://ваш-домен
PUBLIC_API_URL=https://ваш-домен
TELEGRAM_POLLING=1
TELEGRAM_TEST_MODE=true
TELEGRAM_TEST_IDS=ваш_telegram_id
```

Кнопку меню ставит сервер при старте polling, только если URL начинается с `https://`. Тот же адрес можно указать в BotFather. `127.0.0.1` туда не писать.

Два домена тоже возможны: приложение и API на разных `https://`. Origin приложения должен совпасть с `MINIAPP_PUBLIC_URL`.

## Тестовая запись

`SHEETS_TEST_SPREADSHEET_ID` не задан. `npm run setup:test-sheet` ничего не записал. Скрипт отказывается, если тестовый ID совпадает с рабочей таблицей. В тестовую книгу попадают только заголовки и искусственные строки: товар `TEST-HH-001`, курьер `900000001`, без телефонов и без заказов. Рабочая книга остаётся только на чтение.

Сквозной заказ, уведомление, «Выдал» / «Не выдал» и склад в Google не проверялись.
