# TAIL 2.0 — market data

## Sources and coverage

| Source | Used for | Truth boundary |
|---|---|---|
| DexScreener | Solana discovery, raw token/pool snapshots, comparison and current marks | Выборка индексатора; profiles и paid boosts не называются полным launch feed или органическим рейтингом |
| Candle / Birdeye | Существующий keyless 1m/5m/15m/1h/4h/1d OHLCV adapter | Token-wide history, base-token volume; источник и scope подписаны |
| GeckoTerminal / validated DexPaprika fallback | Существующие pool OHLCV/trades/new-pool adapters | 403/429/required-key/shorter history остаются видимыми ограничениями |
| Solana mainnet RPC / backup | Mint program/authorities, balances, signatures, selected transactions, supported pool push | Public node может запрещать дорогие scans; successful getSlot не доказывает доступность getTokenLargestAccounts |
| RugCheck | Явно подписанный indexed holder fallback | Largest-account owner sample и неизвестное balance observation time, не полная holder database |
| Jupiter | Существующие read-only buy/sell quotes | Route/fee availability зависит от API; executable transaction не используется |

Helius и дополнительные платные индексаторы не подключены без существующего ключа. Отдельный Jupiter Tokens/Price API не добавлен: текущие источники уже дают нужное ограниченное покрытие, а новые обязательные credentials не нужны. Официальный Pump.fun launch/migration stream или SDK decoder с проверенными событиями не интегрирован. Lifecycle остаётся Unknown.

## Data model, freshness and request budgets

Raw V2 normalization не приводит отсутствующие числа к нулю. Валидируются Solana chain, exact mint и pool address. Реально измеренный нулевой volume сохраняется как 0, а отсутствующие market cap, buy/sell count, authority, socials и creator fields — null. Pool age считается по `pairCreatedAt`, а не по дате mint creation.

V2 cache: metadata 24h, price 10s, OHLCV 25s, profiles 60s, explicit mint/holder enrichment 30s. В старых wallet/holder adapters сохранены отдельные deduplicated caches. Общий V2 cache ограничен 240 entries и 64 pending jobs. Batch market lookup — до 30 mint, explicit on-chain enrichment — до 8 mint accounts и 4 holder samples; старые snapshots не приобретают новое время цены из-за нового holder fetch.

Один market channel обслуживает несколько потребителей exact mint. Существующие pool streams разделяются по mint/pool/endpoint/commitment с reference counting. Последний unsubscribe закрывает feed/timers. Hidden tabs приостанавливают polling; reconnect/backoff и stale/error states сохраняют исходное время данных. Chart передаёт уже имеющиеся push ticks в market bridge без новой WebSocket-подписки на каждый виджет.

Поддержаны проверенные decoders Orca Whirlpools, Raydium CLMM и Meteora DLMM. Processed prices provisional; confirmed отдельно подписаны. HTTP account bootstrap не объявляется live push. Из spot ticks не создаётся объём. Неподдерживаемый layout сохраняет source-only mode.

## Discovery and signals

Pulse → Advanced даёт категории New, Recently Migrated, Trending, Top Volume, Gainers, Losers, High Liquidity, Watchlist, Custom. Recently Migrated честно недоступна без подтверждённого lifecycle. Нельзя выводить migration из названия, времени покупки или суффикса mint.

Validated DSL поддерживает AND/OR, до 100 nodes и 6 уровней, typed predicates, import/export и до 50 presets. Сопоставление трёхзначное: match / no-match / unknown. Неизвестные/stale числовые данные не удовлетворяют сравнению с 0. Unknown сортируется последним в обоих направлениях. Custom signals вычисляются локально над текущей выборкой. Alert new_match относится к явно отслеживаемым mint, не ко всему рынку.

## Charts

Сохранены Lightweight Charts, paging/Older/All/Latest, реальные OHLCV, colors и expand/fullscreen. Добавлены Area и Heikin Ashi, локальные EMA/SMA/RSI/MACD/Bollinger/Volume MA и VWAP с корректным base-token volume. Warm-up не заполняется вымышленными точками. Market Cap — подписанная оценка; Heikin Ashi — производная визуализация, source candles остаются доступны отдельно.

ChartWorkbench поддерживает до четырёх графиков, Studio — до восьми widget instances с main/A/B/independent contexts. Settings/presets сохраняются локально; crosshair синхронизируется по совпадающему UTC времени. `getChartData` отдаёт bounded original OHLCV, исключая provisional spot, Heikin Ashi и сценарии. Explain selected move передаёт настоящий выбранный диапазон с источником; отсутствующие trades/events не превращаются в объяснение причины.

Local event markers по умолчанию выключены. До 40 alert observations и отдельно manual journal annotations привязываются только к существующим точным UTC buckets исходного ряда. Нет nearest-candle подстановки через gap. Время локального наблюдения отделено от source event time; пользовательская запись не объявляется verified execution. Mode switch/unmount отсоединяет marker plugin, очистка записей убирает markers. Без проверенных wallet purchase/migration/liquidity events соответствующие реальные trading markers не создаются.

## Diagnostics and verification

Source Diagnostics показывает фактический request latency, cache hits/dedup, errors/429, WS state, age received tick и browser bridge delivery. Это не измерение полного пути blockchain event → chart paint. Гарантия 100 ms не заявляется.

Проверены units: null/zero/identity, filters/sort/presets, budgets/TTL, hidden-tab pause, refcount/cleanup, decoders, math и original range. Browser fixtures проверяют unavailable/empty/rate-limit, reload, mode/indicator changes, contexts/mobile. Отдельные live probes и ограничения приведены в [TAIL_TEST_RESULTS.md](TAIL_TEST_RESULTS.md); fixtures не являются доказательством uptime публичных API.
