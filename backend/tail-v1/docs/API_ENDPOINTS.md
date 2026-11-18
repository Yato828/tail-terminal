# TAIL Backend V1 — HTTP API

Все примеры используют `http://127.0.0.1:8787`. Для запросов к живым провайдерам нужен доступ к Internet и соблюдение сторонних лимитов.

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Общий статус и ограничения |
| GET | `/api/market/search?q=dog&limit=20` | Поиск токенов Solana |
| GET | `/api/market/token/:mint` | Пары токена, лучшая пара |
| GET | `/api/market/profiles?limit=20` | Последние профили (индексатор) |
| GET | `/api/market/trending?limit=20` | Boosted token profiles (платное продвижение) |
| GET | `/api/market/new-pools?limit=20` | Новые индексированные пулы GeckoTerminal |
| GET | `/api/market/filter?q=cat&minLiquidity=5000&maxMarketCap=100000&minVolume24h=10000&minBuys5m=4&maxAgeMinutes=120&dex=pumpfun` | Server-side фильтр поверх результатов текстового поиска |
| GET | `/api/market/pool/:pool/ohlcv?interval=1m&limit=150` | Исторические свечи (1m,5m,15m,1h,4h,12h,1d) |
| GET | `/api/market/pool/:pool/trades?limit=20` | Индексированные сделки пула |
| GET | `/api/market/stream/:mint` | SSE `snapshot`/`error`, polling 10s, совместная подписка |
| GET | `/api/wallet/:wallet` | SOL + SPL Token + Token-2022 balances |
| GET | `/api/wallet/:wallet/activity?limit=15` | Последние RPC-подписи |
| GET | `/api/transaction/:signature` | Состояние транзакции |
| GET | `/api/trade/quote?inputMint=...&outputMint=...&amount=100000000` | **Только** Jupiter котировка, количество в atomic units |
| GET | `/api/trade/capabilities` | Честно указывает `buyExecution=false`, `sellExecution=false` |
| GET | `/api/fable/status` | AI availability |
| POST | `/api/fable/chat` | `{"message":"...","context":{"mint":"..."},"history":[]}` |
| POST | `/api/session` | Создать анонимный Bearer token для watchlist/alerts |
| GET | `/api/watchlist` | Bearer token; список контрактов |
| POST | `/api/watchlist` | Bearer; `{"mint":"...","enabled":true}` |
| GET | `/api/alerts` | Bearer; активные/сработавшие алерты |
| POST | `/api/alerts` | Bearer; `{"mint":"...","direction":"above","priceUsd":0.001}` |
| GET | `/api/alerts/events` | Bearer; история срабатываний |
| DELETE | `/api/alerts/:id` | Bearer; удалить алерт |

**Не существует:** `/api/trade/execute`, `/api/trade/sign`, `/api/trade/copytrade` — сервер возвращает 404. Их нельзя рисовать как работающие на клиенте.

## Session + watchlist

```bash
curl -X POST http://127.0.0.1:8787/api/session
# Скопируй token из ответа
curl -H 'Authorization: Bearer YOUR_TOKEN' http://127.0.0.1:8787/api/watchlist
```

## Jupiter quote example

```bash
curl 'http://127.0.0.1:8787/api/trade/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000'
```

Amount=100000000 lamports = 0.1 SOL. В ответе нет транзакции, которую можно подписать.

## Fable example

```bash
curl -X POST http://127.0.0.1:8787/api/fable/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Explain liquidity risk for the SOL token","context":{"mint":"So11111111111111111111111111111111111111112"}}'
```

Вернёт 503 до заполнения OPENAI_API_KEY. OPENAI_MODEL по умолчанию — chat-latest; имя ассистента в продукте — Fable 5.2.

## SSE example

```bash
curl -N 'http://127.0.0.1:8787/api/market/stream/So11111111111111111111111111111111111111112'
```

События содержат `delivery: polling`, чтобы интерфейс не выдавал их за настоящий WebSocket tick stream.
