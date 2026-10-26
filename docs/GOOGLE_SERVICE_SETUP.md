# Google Service Account

Ключ в репозиторий не копируется и в отчёты не выводится. Файл окружения и JSON лежат вне `elfin-market`.

Сервер читает идентификатор таблицы из `GOOGLE_SHEETS_SPREADSHEET_ID`. Ключ берётся из `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SERVICE_ACCOUNT_JSON_PATH`, `GOOGLE_CREDENTIALS_BASE64` или пары email и private key. В лог private key не пишется.

Доступ к рабочей таблице — только чтение, scope `spreadsheets.readonly`. Роль в таблице для этого аккаунта: Viewer. Новые вкладки код не создаёт.

Запись заказов и остатков в Google не реализована и не включается флагом. `SHEETS_READ_ONLY` не равен `0`, `ENABLE_LIVE_WRITES` не включался. Для будущей проверки списаний нужна отдельная копия таблицы, её id в `SHEETS_TEST_SPREADSHEET_ID` и роль Editor только на копии. Такого id нет.

`MINIAPP_PUBLIC_URL` должен быть публичным `https://`. `127.0.0.1` для кнопки Telegram не используется.

`TELEGRAM_BOT_TOKEN` хранится там же, вне Git. `TELEGRAM_TEST_MODE` по умолчанию не выключен: бот не пишет клиентам и курьерам вне `TELEGRAM_TEST_IDS`.
