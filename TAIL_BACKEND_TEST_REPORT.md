# TAIL Backend V1 — проверки

Обновление 16 ноября: оранжево-чёрная тема, резерв часовой истории и актуальная проверка функций описаны в [TAIL_FUNCTIONAL_AUDIT.md](TAIL_FUNCTIONAL_AUDIT.md). Результаты и SHA CSS ниже относятся к состоянию до этого нового запроса.

15 ноября 2026, Europe/Minsk. Ветка `feat/tail-backend-v1`.

## Выполненные команды

| Проверка | Результат |
| --- | --- |
| Исходный пакет `/Users/yato/Downloads/TAIL_BACKEND_V1`: `npm test` | 8/8 passed; HTTP-тест потребовал разрешённого локального bind вместо sandbox EPERM |
| Рабочая копия: `npm run backend:test` | 16/16 passed |
| `npm run backend:smoke` | Health, Fable status, capabilities — HTTP 200 |
| `npm run typecheck` | passed |
| `npm test` | 124 passed; 4 прежних live-теста skipped; 23 test files passed |
| `PART_TEST_BASE=http://localhost:4665 npm run test:browser` | 32 прежних сценария passed; V1-сценарии запускались отдельно |
| `TAIL_V1_TESTS=1 npm run test:browser -- tests/backend-v1.spec.ts` | 6/6 passed (9.1s), включая mobile; вместе с предыдущей группой проверено 38 браузерных сценариев |
| `npm run build` | passed |
| `npm run ext:zip` | passed; extension compatibility сохранена |
| `node scripts/tail-backend-live-probe.mjs` | Реальные read-only GET; результаты в JSON, включая ожидаемые source/auth errors |
| `node scripts/tail-backend-capture.mjs` | Proxy 4664→8787: три HTTP 200; реальный UI, geometry и JavaScript errors |
| SHA-256 visual preservation | CSS/tokens/все mascot-файлы неизменны |

## Обновление: ChatGPT / Fable 5.2

По новому запросу модель по умолчанию — `chat-latest` через OpenAI Responses API, а отображаемое имя во всех режимах — `Fable 5.2`. Добавлены проверки фактического request model, неизменности продуктового имени при другом served model и отсутствия выдуманных ответов без API-ключа. Повторно прошли 16 backend-тестов, 124 unit-теста, 32 прежних и 6 V1 браузерных сценариев. Health/status работающего backend подтверждают `model: chat-latest`, `brand: Fable 5.2`, `configured: false`: для живого чата ещё нужен `OPENAI_API_KEY`.

## Покрытие backend

Сохранены validation, normalization, Solana-only filtering, Jupiter transaction stripping, OHLCV ordering, Token + Token-2022 aggregation, anonymous watchlists/alerts persistence, реальный формат OpenAI Responses через test provider и HTTP read-only policy.

Добавлены проверки mint/cursor binding и OHLC-инвариантов; cache keys/limit; from/to trade identity и отсутствие ложной USD-конверсии; cleanup SSE при раннем disconnect; HTTP contracts всех новых endpoints; нулевой/несвязанный Jupiter quote; отмена provider fetch Fable.

Frontend unit-тесты проверяют безопасный explicit API opt-in, extension rollback, вложенные ошибки API, отсутствие выдуманных полей, точное сохранение выбранного pool, OHLCV seconds↔milliseconds/cursor/asOf, quote binding и удаление transaction/requestId, запрет legacy signing, ограниченный Fable payload/served model, shared polling SSE cleanup.

## Браузерные сценарии V1

1. Search → token → OHLCV → Older history → SSE snapshot → non-executable Jupiter quote → Fable response. Дополнительно запрещены `/ray/` и trade execute/sign/copytrade requests.
2. Upstream candle error и отсутствующая конфигурация AI: явные ошибки, пустые source candles и отсутствие скрытого fallback.
3. Public wallet SOL/SPL balances, signatures и read-only transaction status.
4. Anonymous session, watchlist add/remove, price alert create/delete; Bearer не отправляется другим endpoint-ам; нет обещания 24/7.
5. Pulse profiles/paid boosts/new pools/server-side filter.
6. Mobile 390px: Pulse/Alerts/wallet balances/Settings доступны без горизонтального overflow в существующей оболочке.

В браузерных тестах upstream API заменены детерминированными fixtures. Только в этом test subset заблокирована внешняя Google Fonts stylesheet: зависшая загрузка шрифта однажды удерживала screenshot после уже прошедших UI-assertions. Приложение, его CSS и реальные снимки от этого не менялись. Реальные источники проверялись отдельно.

## Фактические live-результаты

`artifacts/backend-v1/live-probe.json` содержит время, endpoint, HTTP status, provider source и error code.

- HTTP 200: health, capabilities, Fable status, DexScreener search/token/profiles/paid boosts/filter, Solana RPC balances/activity, status наблюдаемой публичной транзакции, Jupiter V2 quote (`executable:false`).
- SSE: HTTP 200, полный snapshot с `delivery: polling` и source DexScreener.
- GeckoTerminal new pools/OHLCV/trades: upstream 403 → backend 502 `UPSTREAM_ERROR`. Эти зависимости не объявляются прошедшими live-проверку.
- Watchlist/alerts/events без Bearer: ожидаемый HTTP 401 `AUTH_REQUIRED`; authenticated CRUD проверен через локальные test sessions и browser fixtures.
- Fable `configured:false`: реальный оплачиваемый chat не запускался. Необходимо настроить `OPENAI_API_KEY` и `OPENAI_MODEL`; успех с реальным провайдером не заявляется.

## Найденные и исправленные проблемы

- Новый backend не передавал выбранный mint/cursor в OHLCV; добавлены совместимые параметры.
- Некорректная quote-currency цена могла называться USD; исправлен trade contract с сохранением старого поля как unknown/null.
- Cache keys не различали limits; исправлено.
- SSE мог создать interval уже после disconnect; исправлено.
- Read-only policy теперь проверяется и перед старым signing entry point.
- Stop на новом Fable endpoint доведён до provider fetch.
- Header account control скрыт существующим mobile CSS: доступ к wallet balances добавлен внутри существующей module navigation, без изменения CSS/header layout.
- Нестабильное ожидание стороннего шрифта при screenshot изолировано в тестовых fixtures.

## Артефакты

- `artifacts/backend-v1/live-terminal-1672.png`: реальный TAIL с Backend V1, без подмены данных.
- `artifacts/backend-v1/live-browser.json`: geometry, proxy checks, JavaScript errors и API failures.
- `artifacts/backend-v1/terminal-1672.png`, `mobile-390.png`: deterministic browser coverage.
- `visual-baseline.json`, `visual-preservation.json`: контроль неизменности визуальных исходников.
- `backend-source-diff.json`: сравнение supplied backend и рабочей копии.

Исключены реальные wallet signatures, транзакции, платные AI generation и production changes.
