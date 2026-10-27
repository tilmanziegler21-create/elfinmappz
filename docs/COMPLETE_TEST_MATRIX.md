# Матрица проверок

Числа ниже сняты с запусков 27 октября 2026. Непроверенное отмечено как SKIP или BLOCKED, не как PASS.

## Автоматические запуски

| Набор | Результат |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `node --check server/index.js` | PASS |
| `server/hh.test.mjs` с файлом окружения | PASS, TOTAL ok |
| `server/bot.test.mjs` | PASS, 24 |
| `server/chain.test.mjs` | PASS, chain ok |
| `server/fixes.test.mjs` | PASS, 17, FAIL 0 |
| `server/reliability.test.mjs` | PASS, 31, FAIL 0 |
| `server/check-render.mjs` | PASS, все пункты OK |
| `npm audit` production | 0 уязвимостей |
| `body-parser` | 2.4.0 |
| `server/check-telegram.mjs` | FAIL: getMe 401, публичный URL Mini App пуст, webhook не проверен |

Первый прогон `hh.test.mjs` без файла окружения упал на `SHEETS_NOT_CONFIGURED`. С тем же файлом, что и раньше, набор зелёный. Это не ошибка живого HG-каталога.

## Публичный сервер

| Проверка | Результат |
| --- | --- |
| GET / | PASS, 200 |
| GET /api/health | PASS |
| GET /api/ready | PASS как диагностика, база ephemeral |
| GET /api/catalog | PASS, 104 товара |
| GET /api/couriers | FAIL для оформления: список пуст |
| POST /api/order/create без сессии | На ревизии 5f19763: 401. Постоянный заказ не создаётся |
| JWT на Render | Секрет задан, значение не читалось |
| Google запись | writes false |

## Экраны

В исходниках экраны: возраст, заставка, главная, каталог, товар, корзина, оформление, заказы, профиль, курьер, админ.

В браузере на публичном сайте открыты: возраст, главная, каталог, товар ELFLIQ, корзина, оформление, заказы, профиль.

Курьер и админ в браузере без роли не открывались. Их отказ проверен тестом бота: `admin-denied`, `cancel-own-only`.

Кнопок и `Press` в `src`: 44 вхождения. Нажаты не все 44. Нажаты возраст, каталог, вкус ELFLIQ, в корзину, назад, корзина, оформление, закрытие, заказы, профиль.

Карта и крипто в оформлении намеренно недоступны.

## Telegram

Команды и callback покрыты `bot.test.mjs` на фиктивных данных: старт, повторный старт, заказы, чужой заказ, профиль, поддержка, курьер, выдача один раз, отказ не-админу.

Живой `getMe`: FAIL 401. Поэтому webhook, `/start` в чате, Mini App из Telegram, iOS и Android не проверялись. Это BLOCKED, не PASS.
