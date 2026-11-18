# Безопасная интеграция с существующим кодом TAIL

Код TAIL/SABLE репозитория недоступен в текущем рабочем окружении. Поэтому архив — самостоятельное приложение, а НЕ правки в старом backend. Старый аудит упоминает `src/lib/axiom.ts`, `src/lib/swap.ts`, `src/lib/rpcFeed.ts`, `src/server/astra.ts`, `src/components/Chart.tsx` и `src/components/WalletSwap.tsx`, но точную текущую структуру необходимо проверить заново.

## План без разрушения текущего сайта

1. Запусти этот backend отдельно на `127.0.0.1:8787`.
2. В существующем Vite frontend добавь `VITE_TAIL_API_URL=http://127.0.0.1:8787` и `ALLOWED_ORIGINS` у backend под фактический frontend origin.
3. Подключи модуль `examples/frontend-adapter.js` через отдельный `src/services/tailApi.js` или TypeScript вариант.
4. Для старого поиска сравни `/api/market/search` с текущей функцией поиска; переключай feature flag `TAIL_NEW_SEARCH` только после совпадения поведения.
5. Для графиков подключи `/api/market/pool/:pool/ohlcv` и `/api/market/stream/:mint` как fallback, **не удаляй** ранее работающие pool WebSocket decoders.
6. Для Fable сделай новый endpoint client к `/api/fable/chat`; не отправляй ключ API из браузера.
7. Для торговой формы подключи Jupiter quote для оценки, **не включай кнопку Buy/Sell** пока нет безопасного transaction policy engine.
8. `store` используется только для anonymous watchlists/alerts, не для кошельков, торговли или PnL. Настоящая авторизация требует Sign-In With Solana и базы данных.
9. На production не переключай пока не выполнены live tests, нагрузочные проверки и решение про hosting.

## Что НЕ делать Codex

- Не удалять старый backend без тестов.
- Не переписывать frontend дизайн и анимации.
- Не переподключать серверные ключи в браузер.
- Не объявлять демонстрационную прибыль реальным PnL.
- Не включать Jupiter `/order?taker=...` + `/execute` до проверки инструкции, quote binding, адресов, суммарных расходов, разрешённых программ, simulation и wallet-confirmation flow.
- Не включать автоматические сделки через Fable.

## Необходимые следующие этапы

1. Auth: SIWS challenge + signature verification + session/CSRF.
2. Execution: подписанные намерения, transaction instruction policy, simulation, explicit wallet confirmation, status recovery, реальный journal.
3. Portfolio: подтверждённые исторические swaps, корректный cost basis, fees, transfers, token taxes, Token-2022, SOL/USD at execution time.
4. Streams: настоящий shared on-chain event stream, verified DEX-specific pool decoders, tick-based candles, staleness latency metrics.
5. Production: persistent quota/budget, backups, metrics, audit logs, failover, rate limits.
