# TAIL 2.0 — free-first cost report

Новые обязательные платные сервисы, тарифы, базы или подписки не подключались. Не создавались платные AI-вызовы для проверки. Это не обещание неограниченного бесплатного API uptime или бесплатных реальных сделок.

| Component | Initial mode | Cost/limit boundary |
|---|---|---|
| Charts/indicators/signals/overlap/manual accounting | Browser computation | CPU/memory пользователя; bounded samples и lazy modules |
| Layouts/watchlists/labels/alerts/journal/snapshots/notes | Browser LocalStorage/IndexedDB | Без server storage bill; browser-profile only, quotas/удаление данных браузером |
| Public Solana RPC | Keyless read-only | Public rate limits/scan restrictions, без SLA |
| DexScreener/Candle/GeckoTerminal/RugCheck/public fallback | Existing free adapters | Региональные запреты, 403/429, ограниченная история; условия и доступность могут меняться |
| Jupiter quotes | Read-only provider | Может потребоваться ключ/квота; execution и платёж не инициируются |
| Fable data tools | Public reads/local computation | Не делают model request сами по себе |
| Fable optional AI | Existing owner-configured OpenAI API | Оплата провайдера владельцем при реальном запросе; отсутствие key отключает модель, остальные tools работают |
| Persistent production AI limits | Existing Upstash only if configured | Квоты/тариф отдельно; production AI fail closed без конфигурации |
| Hosting | Existing project, no V2 deploy | Новые тарифы не включены. Будущий deployment требует согласования и проверки актуальных квот |
| Extension | Local MV3 ZIP | Не опубликован в Chrome Web Store; store registration не выполнялась |
| Future live transactions | Disabled | Solana network fee, priority fee, route/DEX/platform fees оплачивает trader; это не бесплатный режим |

## Request budgets

Metadata/price/history/profiles/mint-holder evidence используют разные TTL. HTTP requests и shared pool subscriptions дедуплицируются; caches bounded; hidden views не получают бесконечные фоновое обновление. Activity scans — 12 signatures, два detail requests одновременно; portfolio — до 12 current marks; market batch — до 30 mint; explicit mint/holder enrichment — 8/4; foreground alerts — 8 mint/4 wallet. Это ограничения продукта, уменьшающие бесплатные квоты, а не обход provider rules.

## Optional AI usage

Fable сохраняет бренд в UI и корректное раскрытие стороннего API в privacy/docs. Существующий default `chat-latest` поддерживает Responses/function calling/streaming согласно [официальной странице модели](https://developers.openai.com/api/docs/models/chat-latest); rolling alias не является собственной моделью TAIL и может менять underlying snapshot. Цена и model availability должны проверяться владельцем перед включением.

Server limits ограничивают request rate/day, conversation size, output tokens, tool rounds/calls и source result size. Фактические provider usage tokens суммируются; отсутствующий usage остаётся неизвестным. Денежная оценка появляется только если owner настроил `ASTRA_PRICE_MODEL` ровно под returned model ID и явные input/output USD rates. Без этих данных UI не рисует выдуманную стоимость $0.

Model responses не кешируются как универсальные свежие рыночные ответы: shared public evidence кешируется по своему TTL, а история диалога bounded. Пользовательские key management/BYOK UI и межпользовательский billing не реализованы. Existing Codex development использует доступную пользователю сессию и её квоты; дополнительные агенты не означают бесплатные или неограниченные model tokens.

## Not activated

Helius paid plan, платный Pump/creator/holder index, X/TG global feed API, 24/7 notification server, новая Neon database и автоматическая торговля не включались. Если бесплатного достоверного источника нет, функция остаётся явно недоступной. Никакая оплата не маскируется fixture данными.
