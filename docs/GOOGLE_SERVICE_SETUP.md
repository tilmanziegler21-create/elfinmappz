# Google Service Account

Ключ в репозиторий не копируется и в отчёты не выводится. Файл окружения и JSON лежат вне `elfin-market`.

Сервер читает идентификатор таблицы из `GOOGLE_SHEETS_SPREADSHEET_ID`. Если заданы оба `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, JWT строится из них. Переносы в ключе могут быть настоящими или записанными как `\n`. Если задан только один из этих двух, сервер отвечает `SHEETS_AUTH_INCOMPLETE` и не подмешивает ключ из файла. Если обоих нет, используется `GOOGLE_APPLICATION_CREDENTIALS` или другой локальный JSON. В лог private key не пишется.

Доступ к рабочей таблице — только чтение, scope `spreadsheets.readonly`. Роль в таблице для этого аккаунта: Viewer. Новые вкладки код не создаёт.

Запись заказов и остатков в Google не реализована и не включается флагом. `SHEETS_READ_ONLY` не равен `0`, `ENABLE_LIVE_WRITES` не включался. Для будущей проверки списаний нужна отдельная копия таблицы, её id в `SHEETS_TEST_SPREADSHEET_ID` и роль Editor только на копии. Такого id нет.

`MINIAPP_PUBLIC_URL` должен быть публичным `https://`. `127.0.0.1` для кнопки Telegram не используется.

`TELEGRAM_BOT_TOKEN` хранится там же, вне Git. `TELEGRAM_TEST_MODE` по умолчанию не выключен: бот не пишет клиентам и курьерам вне `TELEGRAM_TEST_IDS`.
