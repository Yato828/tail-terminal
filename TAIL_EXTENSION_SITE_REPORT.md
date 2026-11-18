# TAIL 1.6.0 — расширение и сайт

> Текущий опубликованный релиз: [TAIL_PRODUCTION_RELEASE_REPORT.md](TAIL_PRODUCTION_RELEASE_REPORT.md). Сведения ниже сохранены как история предыдущих локальных этапов.

17 ноября 2026. Готовые локальные артефакты, без публикации production или Chrome Web Store.

## Что готово

- Главная `/`: оранжево-чёрная презентация TAIL с утверждённым анимированным маскотом, описанием инструментов, скачиванием ZIP и инструкцией установки. Без вымышленных отзывов, доходности или статистики пользователей. Изображение терминала подписано как capture.
- Раздел Try it live запускает настоящий терминал в iframe того же сайта после нажатия. Это тот же интерфейс и инструменты, а не декоративный макет. Закрытие preview размонтирует его и останавливает его подписки.
- `/terminal` открывает полный терминал. Ссылки `?mint=` и `?terminal=1` сохранены; logo возвращает на главную с существующим sphere GIF. Работают browser back и reduced motion. Прежний интерфейс доступен через `?legacy=1`.
- Расширение Chrome / Edge / Brave на Manifest V3: popup 400×580 с графиком первым, полный терминал в отдельной вкладке, сохранение выбранного mint и настроек. Добавлены иконки TAIL и инструкция внутри ZIP.

## Работа сразу после установки

Для публичных рыночных инструментов пользователю не нужны сервер, Node, аккаунт или API-ключи. Проверенные read-only адаптеры Market, Charts, RPC и Jupiter из V1 используются также в браузерной сборке. Общие декодирование адресов и чтение JSON работают в Node и браузере; серверные HTTP helpers и хранилище не попадают в расширение.

В расширении запросы идут к фиксированным публичным источникам. В собранном сайте — через соответствующие same-origin proxy routes; точные RPC-пути проверены отдельно. `npm run dev` и `npm run build` используют standalone mode. `npm run dev:backend` сохраняет явное подключение к прежнему Backend V1; `npm run dev:legacy` оставляет старый режим для регрессий. Ошибка явно подключённого сервера не подменяется автономными данными.

Watchlist и ценовые алерты standalone сохраняются в профиле браузера отдельно от серверных anonymous sessions. Алерты проверяют реально полученные цены при открытом monitored view. Создание, удаление, сохранение после reload и однократное срабатывание покрыты проверками. Данные не выдаются за синхронизированный серверный аккаунт или доказательство владения кошельком.

## Пакет

[Скачать ZIP](public/tail-extension.zip) · [Распакованная сборка](dist-ext/manifest.json) · [Проверка архива и SHA-256](artifacts/extension-release/package.json)

Версия **1.6.0**, размер **1 240 109 байт**. Проверены CRC всех файлов, manifest, popup, локальный SVG, четыре PNG-иконки и README. Каждый файл ZIP совпадает с установленной `dist-ext` сборкой. ZIP в `dist/` идентичен скачиваемому файлу. `public/part-ext.zip` сохранён как совместимая ссылка. `.env`, server data и `node_modules` отсутствуют в пакете; localhost отсутствует в host permissions.

Установка: распаковать ZIP → открыть Extensions → Developer mode → Load unpacked → выбрать папку с `manifest.json` → закрепить TAIL. Это [официальный способ установки локального расширения Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked); ZIP не объявляется установкой из магазина.

## Проверки

| Проверка | Наблюдаемый результат |
| --- | --- |
| TypeScript | `npm run typecheck` — passed |
| Unit | 143 passed, 4 штатных live skip |
| Unit + live | `npm run test:live` — **147 passed** |
| Backend V1 | **24 passed** после изменения общего runtime |
| Browser regression | **39** совместимых сценариев и **13** V1; исправленный popup проверен отдельно после смены интерфейса |
| Собранный сайт | **4 passed**: настоящий download, iframe с 40 fixture-свечами, полный terminal/возврат/back, мобильная навигация и отсутствие overflow |
| Установленное расширение | Popup, интервалы, volume units, pause, settings, watchlist persistence, alert create/delete, все **12** связанных модулей, полный tab и quote-only policy — passed |
| Расширение с реальными API | Публичные свечи и Jupiter quote, основные панели, настройки и локальные записи — passed; **0 JS errors**, **0 HTTP requests to localhost** |
| Сборки | `npm run ext:zip`, затем `npm run build` — passed |

Browser fixtures проверяют управляемые состояния отдельно от реального прохода. В настоящем встроенном терминале SOL загружено **1 804 дневных бара** с источником Candle / Birdeye. Прямой публичный Jupiter endpoint ответил HTTP 200 без ключа; реальная котировка в расширении также проверена. Транзакции не подписывались и не отправлялись.

Артефакты: [главная](artifacts/site-release/home-desktop.png), [mobile](artifacts/site-release/home-mobile.png), [настоящий iframe](artifacts/site-release/interactive-terminal.png), [runtime сайта](artifacts/site-release/results.json), [установленный popup](artifacts/extension-release/popup-chart.png), [полный терминал](artifacts/extension-live/extension-desk.png), [все модули](artifacts/extension-release/results.json), [real-source extension run](artifacts/extension-live/results.json).

## Ограничения и публикация

Покрытие holders/trades, задержка New Pairs, глубина истории и rate limits зависят от публичных источников и показаны в интерфейсе. Token-wide OHLC и объём в единицах токена не смешиваются с pool spot и USD volume.

Fable 5.2 остаётся недоступным без настроенного AI-сервиса; API-ключей в ZIP нет. Buy/sell execution, signing, autotrading, полный PnL ledger и фоновая доставка уведомлений не реализованы этим релизом. Их наличие не обещается на сайте.

Готовы `dist/` и скачиваемый ZIP. Для публичного URL сайта требуется отдельная публикация. Она не выполнялась согласно просьбе пользователя не изменять production без разрешения. Изменения конфигурации маршрутов и same-origin iframe подготовлены локально.


## Уточнение визуала и Info — 17 ноября

Убраны боковые оранжевые вставки внутри капюшона во всех действующих SVG и иконках. Главный экран использует отдельную фиксированную сидячую позу на планете; взгляд, дыхание и reduced motion сохранены. В хедере сайта добавлены явно отключённые заглушки Telegram, Pump.fun и X/Twitter без выдуманных ссылок. Info на сайте и в терминале содержит Overview, Setup и Install с общей инструкцией установки. Переключение вкладок работает с клавиатуры; Escape закрывает руководство, сохраняя открытую фоновую панель.

Проверки этого изменения: TypeScript; 143 unit passed / 4 штатных live skip; 15 browser-сценариев сайта, терминала и анимации; отдельно 6 сценариев сайта после правки мобильного хедера; установленный пакет расширения с Info и 12 связанными модулями; build и ext:zip. Production не изменялся.

[Новый главный экран](artifacts/planet-info/hero-desktop.png) · [Мобильный хедер](artifacts/planet-info/hero-mobile-viewport.png) · [Info](artifacts/planet-info/info-overview.png) · [Установка](artifacts/planet-info/info-install.png)

## Fable и переходы — 17 ноября

В публичном интерфейсе используется Fable 5.2. Убраны сообщения с настройкой ключей, сведения о провайдере и технические модельные идентификаторы. Недоступность сервиса и ограничения запросов показываются понятными статусами; недоступный чат остаётся отключённым. Внутренние ответы и метаданные сервиса не подменяются.

Добавлены приветствие с маскотом, орбитами и supplied sphere GIF при входе в терминал и обратный переход на главную. Переход ожидает загрузку настоящего терминала, сохраняет mint/pool в прямых ссылках, поддерживает Reduced motion и быстрое переключение браузерных Назад/Вперёд. После завершения восстанавливается клавиатурный фокус. Ошибка GIF не блокирует интерфейс.

На лендинге удалены номера секций, мелкие декоративные слоганы и повторяющие пояснения. Кнопка больше не перекрывает изображение терминала. Само изображение обновлено реальными данными SOL: **1 804 свечи**, Candle / Birdeye, **0 ошибок JavaScript**. Источники и существенные ограничения рыночных данных сохранены.

Проверки: TypeScript, **153 unit passed / 4 штатных live skip**, браузерные регрессии сайта и терминала, **13 V1 сценариев**, **9 сценариев собранного standalone сайта**, установленное расширение со всеми **12 модулями**, `ext:zip` и `build`. CRC всех 25 файлов ZIP и совпадение с `dist-ext` и копиями для скачивания подтверждены. Production не изменялся.

[Главная](artifacts/site-polish/home-desktop.png) · [Mobile](artifacts/site-polish/home-mobile.png) · [Приветствие](artifacts/site-polish/welcome-live.png) · [Возврат](artifacts/site-polish/return-home.png) · [Реальный терминал](artifacts/site-polish/terminal-live.png) · [Результат](artifacts/site-polish/results.json)


## Актуальная 2D-система из ZIP

Прежний SVG-маскот заменён готовым PNG/Canvas runtime из TAIL_2D_CODEX.zip. События запросов подключены через предоставленный TailEventBridge. Полный актуальный результат, видео и ограничения проверки браузеров: [TAIL_2D_INTEGRATION_REPORT.md](TAIL_2D_INTEGRATION_REPORT.md).
