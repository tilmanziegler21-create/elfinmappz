# ELFIN Product Media

Один компонент `ProductFloatStage`. Бренд не получает свою анимацию. Пресет задаёт парение, наклон и тень. `accent` меняет только подсветку и дымку.

| Пресет | Парение | Наклон |
| --- | --- | --- |
| liquid-float | 5,5 с, 10 px | ±1,5° |
| device-float | 6 с, 7 px | ±1° |
| pod-float | 6,5 с, 6 px | ±0,8° |
| static-product | нет | нет |

Каталог не парит. Кристаллы сцены не едут с товаром. Тень — отдельный слой.

## Папки

- `public/assets/products/liquids/`
- `public/assets/products/devices/` — пусто, пресет `device-float` готов
- `public/assets/products/pods/`
- ELFLIQ остаётся в `public/products/elfliq-watermelon.png`

## productMedia.json

Ключ — id линейки в демо-каталоге. Поле `sku` пустое: сервер подставляет кадр только при полном совпадении артикула. Общая фотография вкуса на другой SKU не копируется. Нет своего кадра — кристалл. Колонка `image` в таблице сейчас указывает на общий файл бренда, не на этикетку вкуса.

| Ключ | Сцена | Accent | Файл |
| --- | --- | --- | --- |
| elfliq-watermelon | liquid-float | melon | `/products/elfliq-watermelon.png` |
| chaser-lux-turbo-mint | liquid-float | mint | `liquids/chaser-lux-turbo-mint.png` |
| chaser-fp-cherry | liquid-float | cold | `liquids/chaser-fp-cherry.png` |
| hqd-grapey | liquid-float | grape | `liquids/hqd-grapey.png` |
| vozol-strawberry-ice | liquid-float | frost | `liquids/vozol-strawberry-ice.png` |
| xros-5-mini | pod-float | pod | `pods/xros-5-mini.png` |

CHASER LUX и CHASER FP — разные файлы. На фото вишни написано SALT, не FP: линейка назначена по файлу, который передан как CHASER FP.

Без фото остаются кристаллами: Северный, Ясный, Тихий, Первый снег, Сапфир, Иней.

Вырез: с фото снят только фон. Этикетка не перерисовывалась. У VOZOL предупреждение уже обрезано на исходном кадре.
