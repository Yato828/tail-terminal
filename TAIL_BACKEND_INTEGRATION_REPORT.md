# TAIL Backend V1 — отчёт об интеграции

Обновление 16 ноября: оранжево-чёрная тема, резерв часовой истории и актуальная проверка функций описаны в [TAIL_FUNCTIONAL_AUDIT.md](TAIL_FUNCTIONAL_AUDIT.md). Результаты и SHA CSS ниже относятся к состоянию до этого нового запроса.

Обновление по новому запросу: ответы настроены через OpenAI `chat-latest` (GPT из ChatGPT), имя ассистента во всех режимах — **Fable 5.2**. По умолчанию модель уже задана; для реальных ответов остаётся настроить серверный `OPENAI_API_KEY`. Упоминания обязательного отдельного выбора модели ниже относятся к исходной интеграции V1.

Дата: 15 ноября 2026, Europe/Minsk. Ветка: `feat/tail-backend-v1`.

## Результат и запуск

Backend найден в `/Users/yato/Downloads/TAIL_BACKEND_V1`. Инструкция `docs/CODEX_ATTACH_THIS_BACKEND_RU.md` прочитана. Исходная папка не изменялась; версионируемая рабочая копия находится в `backend/tail-v1`.

Локально запущены:

- TAIL с Backend V1: **http://localhost:4664/**.
- Backend: **http://127.0.0.1:8787/**.
- Отдельный frontend со старыми API для регрессионных тестов: http://localhost:4665/.

Для повторного запуска нужны два терминала:

```sh
npm run backend:start
npm run dev:backend
```

`dev:backend` явно включает `VITE_TAIL_API_URL=/tail-api`. Vite перенаправляет `/tail-api/*` в `http://127.0.0.1:8787/api/*`; адрес upstream можно задать серверной переменной `TAIL_BACKEND_URL`. Предыдущие `/dex`, `/gecko`, `/rpc`, `/ray`, `/api/astra` не удалены. Обычный `npm run dev` оставляет прежние адаптеры; автоматического переключения production нет. Расширение сохраняет свой прежний совместимый клиент и website handoff.

## Сохранность frontend

Основная сетка терминала, CSS, design tokens, SVG rig, controller и анимации маскота сохранены. Проверка SHA-256 всех файлов `src/mascot`, `src/features/tail/tail.css` и `src/design-system/tokens/tail.css`: **все совпадают с состоянием перед интеграцией**. Доказательства: `artifacts/backend-v1/visual-baseline.json` и `visual-preservation.json`.

Поменялись источники данных и состояния доступности. Новые функции открываются внутри существующих диалогов: Pulse, Alerts, Account, Settings. На узком экране балансы доступны через Portfolio → Wallet balances: скрывать/перестраивать существующий header не понадобилось. У торговой формы остались прежние контейнеры и кнопка получения котировки; маршрут теперь честно подписан Jupiter / quote only.

Начальная рыночная выборка V1 содержит три базовых mint и до шести последних профилей; это отслеживаемая выборка, а не полный реестр Solana.

Реальный скриншот: `artifacts/backend-v1/live-terminal-1672.png`. Геометрия: header 82px, sidebar 170px, начало колонок x184/x454/x1300, chart 832×807px, trade 360×425.53px, Fable 360×368.47px. Ошибок JavaScript в реальном захвате нет. Данные и состояние источников отличаются от старого снимка естественным образом.

## Подключённые endpoints

В таблице указаны пути standalone backend; frontend использует соответствующие `/tail-api/*`.

| Endpoint | Где подключён | Фактический результат |
| --- | --- | --- |
| `GET /api/health` | Settings → Backend connection; proxy smoke | 200 на реальном сервере |
| `GET /api/market/search` | Глобальный поиск | 200; сохраняются Solana/base58 case и история поиска |
| `GET /api/market/token/:mint` | Поиск по mint, token details, обновление выбранного пула | 200; выбранный pool не подменяется другим «лучшим» pool |
| `GET /api/market/profiles` | Рыночная выборка; Pulse → Profiles | 200; недавние профили не объявляются исчерпывающим списком запусков |
| `GET /api/market/trending` | Pulse → Paid boosts | 200; явно обозначены платные boosts, не organic trending и не smart money |
| `GET /api/market/new-pools` | New Pairs; Pulse → New pools | Адаптер подключён; реальный upstream GeckoTerminal сейчас возвращает 403 |
| `GET /api/market/filter` | Pulse → Filter | 200; фильтры применяются к результатам поиска, не ко всей Solana |
| `GET /api/market/pool/:pool/ohlcv` | Существующий chart engine, интервалы и Older history | Контракт проверен; реальный upstream сейчас 403, UI показывает ошибку и Retry |
| `GET /api/market/pool/:pool/trades` | Recent pool trades / Flow, существующие evidence views | Контракт проверен; реальный upstream сейчас 403 |
| `GET /api/market/stream/:mint` | Общая подписка на token snapshots; оценка условий alerts | Реальный SSE 200, `delivery: polling`; не выдаётся за WebSocket tick |
| `GET /api/wallet/:wallet` | SOL balance connection; Account / Wallet balances | 200; SOL, SPL, Token-2022; не PnL |
| `GET /api/wallet/:wallet/activity` | Account → Recent signatures | 200; signatures не объявляются классифицированными swaps |
| `GET /api/transaction/:signature` | Account → Check transaction status | 200 для наблюдаемой публичной сигнатуры; `null` означает not observed, не success |
| `GET /api/trade/quote` | Правая форма; read-only Exit Simulator | Реальный Jupiter 200; `executable:false`; без taker, signing/submission и передачи transaction в frontend |
| `GET /api/trade/capabilities` | Quote flow и Settings | 200; buy/sell/signing/autotrading выключены |
| `GET /api/fable/status` | Fable и Settings | 200; сейчас `configured:false` |
| `POST /api/fable/chat` | Существующий Fable UI, история, Stop, mascot events | Контракты и UI проверены тестами; реальный платный запрос не выполнялся, конфигурация отсутствует |
| `POST /api/session` | Только при открытии session-функций Alerts/watchlist | Анонимный Bearer в sessionStorage; не доказывает владение кошельком |
| `GET/POST /api/watchlist` | Alerts → Watched tokens | CRUD проверен HTTP/browser-тестами; без Bearer реальный API правильно отвечает 401 |
| `GET/POST /api/alerts` | Alerts → Price condition | Создание и чтение проверены; лимиты сервера сохранены |
| `GET /api/alerts/events` | Alerts → Observed events | Проверены одноразовые срабатывания и отсутствие повторного события |
| `DELETE /api/alerts/:id` | Delete alert | Проверено; Bearer обязателен |

Имеющиеся проверенные Orca Whirlpools / Raydium CLMM / Meteora DLMM account decoders не удалены и не заменены SSE. SSE обновляет только snapshot выбранного токена; его данные не превращаются в исторические свечи или объём. При сбое нового API клиент не переключается незаметно на Raydium execution или старый AI endpoint.

## Исправления совместимости в рабочей копии backend

1. OHLCV принимает необязательные `token` и `before_timestamp`, передаёт их upstream и возвращает token в response. Сохранились старые параметры и интервалы. Проверяются OHLC-инварианты, timestamp и неотрицательный объём.
2. Cache keys для new pools/trades учитывают limit. New pools дополнены проверяемыми frontend-ом base/quote mint из relationship IDs; отсутствие mapping не заменяется догадкой.
3. Trades возвращают from/to mint, amount, wallet и доступные USD prices. Старое `priceUsd` сохранено как `null`: прежний код подставлял quote-currency ratio в поле USD, что могло давать ложную цену.
4. Read-only quote дополнен `outputDecimals`, полученными через RPC. Если decimals недоступны, UI показывает atomic units. Amount/pair проверяются; нулевой или несвязанный ответ Jupiter отвергается. Transaction и requestId отбрасываются и на сервере, и на клиенте.
5. Исправлена гонка SSE при disconnect до первого snapshot / одновременных подписках: не остаются лишние polling timers.
6. Fable status дополнен публичным именем configured model. Stop/Abort доведён до provider fetch; последующие tool rounds после отмены не продолжаются. Возврат уже потраченной провайдером квоты этим не гарантируется.

Оригинальные восемь тестов backend продолжают проходить. Добавлены шесть тестов для совместимости и lifecycle. Манифест отличий исходного пакета: `artifacts/backend-v1/backend-source-diff.json`.

## Что настроить локально

`backend/tail-v1/.env` создан из supplied `.env.example`; реальные секреты не подставлялись и из других конфигураций не копировались.

- Для реального Fable: `OPENAI_API_KEY` **и** `OPENAI_MODEL` модели, доступной вашему аккаунту. Старое имя `ASTRA_MODEL` не заменяет `OPENAI_MODEL` нового backend.
- `JUPITER_API_KEY` поддерживается сервером для соответствующих квот/доступа. Проверенная в этом запуске котировка прошла без добавления ключа; это не обещание постоянной доступности keyless API.
- `SOLANA_RPC_URL`, при необходимости `SOLANA_RPC_BACKUP_URL`: HTTPS endpoints. Сейчас подтверждён доступ к публичному Solana mainnet RPC.
- `ALLOWED_ORIGINS`: точные локальные origins при прямом обращении к backend. Для текущего frontend используется same-origin Vite proxy.
- Для GeckoTerminal необходимо решить фактический upstream-доступ: сейчас `api.geckoterminal.com` отвечает 403, который backend передаёт как `502 UPSTREAM_ERROR`. Подстановка фиктивных ключей/свечей не применялась.

После изменения `.env` backend нужно перезапустить. Provider credentials никогда не получают префикс `VITE_`. `.env` и session data не попадают в git.

## Нереализованные и ограниченные функции

- Buy/sell execution, transaction building/policy, signing, autonomous/copy trading: отсутствуют и заблокированы. Старый `executeSwap` дополнительно отказывает при включённом V1 ещё до обращения к wallet provider.
- Realized/unrealized PnL, cost basis и positions ledger: отсутствуют. Балансы и signatures не называются прибылью.
- 24/7 alerts, Telegram, email/web push и отдельный background worker: отсутствуют. Alerts оцениваются при активном token stream. Alerts view подписывает максимум 10 разных pending mints, при скрытии вкладки приостанавливает свои listeners; выбранный токен может иметь собственную отдельную подписку.
- Wallet authentication / SIWS, server-synced layouts: отсутствуют. Анонимный token — только watchlist/alerts этой вкладки, не wallet identity.
- Полный social monitor, достоверная социальная атрибуция, Twitter/X scraping: отсутствуют; прежний manual analysis остаётся прежним инструментом.
- У Fable V1 четыре read-only tools: overview/search/public balances/signatures. Нет chart-OHLCV, new-pool или trending-ranking tool. Соответствующие быстрые кнопки Fable отключены в V1; сами chart/Pulse API доступны напрямую. Compare/Analyze и wallet inspection сохраняют только реально доступный контекст.
- `/api/astra/scenario` не реализован в V1: старые настройки сохранены, но новый режим не показывает сценарий как доступную возможность. Старый режим по-прежнему проверяется отдельно.
- Отдельных V1 API для holders, KOL, SPL deployment, website hosting нет. Имеющиеся frontend read-only/manual/draft/export модули сохранены; live deployment по-прежнему отключён.
- Budgets/rate limits Fable остаются process-local, anonymous storage — локальный JSON. Production auth, persistent quotas, scaling/observability и background monitoring не объявляются готовыми.

## Проверки и артефакты

См. `TAIL_BACKEND_TEST_REPORT.md`. Все local contract/unit проверки проходят; provider-dependent проверки перечислены отдельно, без объявления GeckoTerminal/Fable готовыми при недоступном источнике/конфигурации.

Production, remote deployments, DNS и облачные настройки не изменялись. Транзакции не создавались, не подписывались и не отправлялись. Платные AI-запросы при проверке не выполнялись.
