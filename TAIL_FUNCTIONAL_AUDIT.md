# TAIL — функциональный аудит frontend + backend

16 ноября 2026, Europe/Minsk. Проверены локальные http://localhost:4664/ с Backend V1 и совместимый frontend на 4665. Production не изменялся.

Обновление графика и hover: [TAIL_CHART_HISTORY_FIX_REPORT.md](TAIL_CHART_HISTORY_FIX_REPORT.md). Предыдущий лимит часовых свечей снят для mint, покрываемых новым публичным источником. Остальные результаты предыдущего аудита сохранены.

Последующий релиз 17 ноября: [расширение и сайт TAIL 1.6.0](TAIL_EXTENSION_SITE_REPORT.md). Автономная сборка использует прямые публичные источники и browser-profile watchlist/alerts; ниже сохранены результаты серверного аудита 16 ноября.

Статусы: **works** — заявленный сценарий выполнен; **partially works** — доступна часть сценария с перечисленными ограничениями; **broken** — воспроизводимый неустранённый дефект; **not implemented** — функция отсутствует. Успешная проверка честного unavailable-state не означает доступность внешних данных.

## Каждый ключевой модуль

| Модуль | Статус | Проверка и фактический результат |
| --- | --- | --- |
| 1. Token Search | **works** | Настоящие запросы Solana, JUP и case-sensitive mint USDC дали результаты; выбранный токен открылся. Проверены deep links, ошибки и восстановление |
| 2. Market Pulse | **works** | Настоящие tracked markets, их суммарный 24h volume и RPC TPS. Во время UI-прохода зарегистрированы два profile-fetch; отдельные регрессии проверяют обновления. Подписи не выдают число отслеживаемых рынков за весь Solana mainnet |
| 3. Trending | **works** | Реальные tracked markets загружаются. 5m/1h/24h меняют сортировку по соответствующему объёму и его подпись; данные не являются organic-trending рейтингом всей сети |
| 3. New Pairs | **partially works** | В реальном UI загружено 8 записей. Индексатор может запаздывать; keyless DexPaprika исключает самый новый час. Ошибки независимы от Market Pulse; обновление раз в минуту во время просмотра |
| 3. Gainers / timeframe | **works** | В реальном проходе отображены 5 положительных изменений. Сортировка и фильтр используют выбранный период; неизвестное изменение не считается нулевым ростом |
| 4. Wallet Tracking | **partially works** | Добавление/открытие watched public address, rename/pin/remove и сохранение проверены. Реальные публичные RPC balances/signatures доступны; часть transaction details ограничена или rate limited. Полнота истории не обещается |
| 4. Smart Money | **partially works** | Отображает наблюдаемую активность до трёх выбранных адресов; реальный проход получил строки с failed transaction / no balance change и явными unavailable details. Доходность и performance ranking отсутствуют |
| 5. Bubble Map view | **partially works** | Открывается настоящий canvas/view. Для проверенного USDC owner sources оказались недоступны; отрисовано **0** владельцев с явной причиной, без синтетических узлов. После отказа не остаётся ложного вечного Loading. Контракты/рендер известных owner snapshots проверены fixtures |
| 5. Bubblemaps service / transfer edges | **not implemented** | Отдельной интеграции с сервисом Bubblemaps и подтверждённого transfer indexer нет. Карта крупнейших owners не выдаётся за граф связей |
| 6. Исторические свечи | **works** | В текущем V1 настоящий SOL: 1 803 дневных бара с 10 декабря 2021, видим весь загруженный ряд. All подгружает историю назад; Latest меняет масштаб без удаления старых баров. За один проход загружается до 8 страниц; Older history продолжает. Покрытие зависит от индексатора, полнота с даты выпуска mint не гарантируется |
| 6. Резерв источника / пула | **works** | Первый источник для явного mint — Candle / Birdeye, история всего токена с отдельной подписью. Резервы сохранены: GeckoTerminal 403 → проверенная DexPaprika история. У выбранного USDC PancakeSwap-пула был 404; ограниченная проверка других рынков того же mint нашла Raydium `BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU`. Меняется сам выбранный рынок; mint сохранён, новый pool ID показан и записан в URL. Reload сохраняет пул |
| 6. 1m / 5m / 15m и старая история | **works** | Подключён документированный публичный Candle history API. Реальный SOL: 500 минутных баров; свежий mint из New Pairs: 22 бара 1m в финальном проходе. Для рынков младше 6h автоматически выбран 1m. В источнике сохраняются реальные пробелы; резерв DexPaprika по-прежнему ограничен часовыми барами за 24h |
| 6. Candles / Line / Price / MCap est. / Log | **works** | Режимы переключены на настоящих восстановленных USDC-свечах без ошибок JS. MCap — оценка по текущему implied supply с раскрытой оговоркой. Fit/Latest, zoom/pan/expand и OHLC покрыты browser-регрессиями |
| 6. Обновления / empty / stale / delayed | **works** | Реальная Orca WSS-нотификация: slot **470035493**, processed, около 117 ms с момента получения в снятом кадре. HTTP bootstrap не принят за live. Pause/resume/reconnect/visibility и stale/empty/error проверены. Volume берётся из истории с явными единицами USD/token. Pool spot overlay применяется только к pool-свечам; в token-wide истории он остаётся отдельным ticker |
| 7. Buy / Sell panel: quote | **partially works** | Настоящий Jupiter quote для 0.1 SOL → USDC: 7.107448 USDC, router metis, provider fee 2 bps на момент проверки. Значения зависят от времени. V1 — `executable:false`, slippage явно `Not applied · quote only`. Сетевые комиссии/исполнение не выдумываются |
| 7. Buy / Sell execution, signing, autotrading | **not implemented** | В Backend V1 отсутствуют execute/sign/copytrade; Sell отключён. Реальных транзакций не отправлялось. В прежнем адаптере истёкшая котировка теперь обновляется рабочим Refresh quote |
| 8. Fable 5.2 | **partially works** | Настоящий POST отправлен в локальный backend: HTTP 503 `AI_NOT_CONFIGURED`, потому что нет OPENAI_API_KEY. Поле/кнопка отправки отключены с причиной. Реальный provider answer не заявляется; JSON-контракты loading/success/error/Stop, история и безопасный текст проверены fixtures/unit |
| 8. Quick actions | **partially works** | Analyze token / поиск рынков / выбранный wallet привязаны к имеющимся read-only инструментам. Нужны AI-ключ и требуемый контекст. Explain chart отключён в V1, где OHLCV-tool не реализован. Нет декоративных действий без handler |
| 8. AI token streaming / live tool progress | **not implemented** | V1 возвращает финальный JSON. UI не выдаёт имитацию печати за streaming, не выдумывает ход серверных tools |
| 9. Alerts / watchlist | **works** | Реально созданы watch entry и alert, проверены список и сохранение после reload. Alert USDC сработал по полученной цене **0.9984 USD**, событие прочитано. Созданные watch entry и alert удалены из собственной тестовой анонимной сессии |
| 9. Background 24/7 / Telegram / Web push | **not implemented** | Alert evaluation зависит от активного stream listener; текущая view подписывает до 10 mint, при скрытой вкладке подписки останавливаются. Фоновая доставка не заявлена |
| 10. Portfolio: public balances / history | **partially works** | Раздел открывается, доступны public wallet balances и observed activity. Пока загружается RPC, показан Loading; частичные детали помечены unavailable. Подпись не считается доказанным swap |
| 10. Positions / cost basis / PnL | **not implemented** | Нет полного verified trade ledger и расчёта себестоимости. Нет фейковых позиций, PnL и прибыльности; это прямо указано в Portfolio и Smart Money |
| 11. Workspace / widgets / settings | **works** | Реальное скрытие виджета сохранилось после reload. Browser-проверки покрывают возвращение, layouts, reorder, pin/maximize/resize, launcher, persistence/reset и повреждённый storage. Холодный акцент мигрирует в утверждённую тёплую палитру |
| 12. Wallet connect UI | **partially works** | Проверен disconnected/no-installed-wallet путь: чистый Chrome показывает понятную ошибку. Реальные Phantom/Solflare account connection и wallet approval в этой среде не выполнялись; signing в V1 отключён |
| Маскот и event binding | **works** | Один SVG rig, 11 состояний, 13 переходов, eye tracking, reduced motion, остановка offscreen/hidden и приоритеты. Записан настоящий runtime; состояние success не завершает чужой AI-request |
| SPL drafts / website preview и export | **works** | Локальные drafts, supply validation, sandbox-preview и экспорт покрыты browser-регрессиями; публикация не выполнялась |
| Live SPL deployment / website hosting / social ingestion / AI image generation | **not implemented** | Нет подключённых функций публикации, сбора социальных данных и генерации изображений. Не подменяются демонстрационными результатами |
| Trade Flow | **partially works** | Клиент/view реализованы. Сейчас indexed trades endpoint недоступен: `TRADES_SOURCE_REQUIRED`, что показано явно. Wallet signatures и WSS spot не объявляются лентой исполненных сделок |

Известные воспроизведённые кодовые дефекты этого прохода исправлены. Текущие ограничения источников и отсутствующие функции перечислены отдельно в таблице.

## Что исправлено после настоящего прохода

- Default USDC pool отсутствовал в историческом индексе: добавлена проверяемая смена выбранного рынка с точным mint/pool binding и ограничением в три альтернативы.
- Ошибка trader fallback скрывала причину отказа holders; объединены причины и исправлено состояние карты после ошибки.
- Timeframe Trending, положительный Gainers, раздельные errors New Pairs/Market Pulse, подпись quote-only slippage и обновление истёкшей котировки исправлены.
- Backend дополнен необязательными реальными 24h transaction counts и публичным адаптером token-wide свечей с валидацией mint/chain/interval, единицами объёма и пагинацией. Missing counts остаются null.
- Приоритеты motion учитывают конкурирующие операции, а не только последнюю пришедшую success-реакцию.

## Проверки и источники доказательств

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run test:live` | **142 passed**; включает обычные unit и 4 live-проверки |
| `npm run backend:test` | **24 passed** |
| Browser compatible frontend | **35 passed**, V1 tests штатно пропущены здесь |
| Browser Backend V1 | **13 passed**; включая минутные свечи, историю >500 баров и восстановление источника |
| Motion regression после финальной приоритизации | **3 passed** повторно |
| `npm run build`, `npm run ext:zip` | passed; локальные артефакты |

- [График после исправления](artifacts/chart-history/runtime.json): 1 803 дневных свечи, 500 минутных, свежий mint 1m; прозрачный hover и 0 JS errors.
- [Реальный UI-проход](artifacts/tail-fix/interface-live-audit.json): actual requests и module statuses, без подмены market data; ошибок JavaScript нет.
- [Восстановленный USDC](artifacts/tail-fix/usdc-recovered-real.png): настоящий mint/pool/source и 24h limit.
- [SOL и геометрия](artifacts/tail-fix/visual-measurements.json): actual candles/WSS, palette, rectangles, 0 JS errors и отсутствие mobile overflow.
- [Motion capture](artifacts/tail-fix/motion-capture.json), [видео](artifacts/tail-fix/motion-review.webm).
- [Сравнение с утверждённым экраном](artifacts/tail-fix/visual-comparison.html).

Browser fixtures проверяют контракт и состояние UI. Отдельные реальные проверки устанавливают текущую доступность источника. Успешный тест unavailable-state не превращает недоступную функцию в работающий provider.

Ключей и bearer session token в отчётных артефактах нет. Проверяемый public address не выдаётся за принадлежащий пользователю кошелёк. Платных AI-вызовов, реальных подписей, сделок и production deployment не было.
