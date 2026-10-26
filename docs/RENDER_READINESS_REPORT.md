# Готовность к Render

Дата: 26 октября 2026. Деплой на Render не выполнялся. Проект не в эксплуатации.

| Проверка | Статус |
| --- | --- |
| Frontend Build | PASS |
| Backend Build | PASS |
| Port Binding | PASS |
| Healthcheck | PASS |
| Telegram | FAILED |
| Sheets HH | FAILED |
| Storage | EPHEMERAL |
| Live Writes | DISABLED |
| Render Blueprint | READY, один Web Service |
| Public deploy | NOT DEPLOYED |

`npm run build` прошёл: TypeScript, `dist/`, `node --check server/index.js`.

`npm run check:render` на `PORT=10000` прошёл локально:

- процесс слушает `0.0.0.0:10000`;
- `GET /` отдаёт Mini App;
- `POST /api/order/create` без `DATABASE_URL` получает `503`;
- пустые production-переменные пишутся в лог только именами;
- `GET /api/health` отвечает `city=HH`, `writes=false`;
- `GET /api/ready` показывает Telegram `not configured` и диск `ephemeral`;
- webhook без секрета получает `401`;
- повторный `update_id` помечается как duplicate;
- чужой origin не получает CORS;
- поддельный токен останавливает `telegram:webhook:setup` на `401`, URL webhook не ставится.

Реальный `getMe` с токеном из окружения раньше и сейчас не принимается Telegram. Поэтому Telegram остаётся FAILED. Polling в production выключен.

Подключённая книга по-прежнему «Muenchen», вкладки `*_HH` отсутствуют. Каталог Hamburg не подменён. Запись в таблицу не включалась.

Заказы лежат в локальных JSON-файлах `data/`. При `DATABASE_URL` снимок пишется в PostgreSQL-таблицу `elfin_state`. База не подключена, поэтому сохранение после рестарта не проверено. В production без базы новые заказы отклоняются.

`render.yaml` описывает один Web Service во Frankfurt. Секретов в файле нет. На Render сервис не создавался.
