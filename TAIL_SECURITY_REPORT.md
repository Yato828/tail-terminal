# TAIL 2.0 — security review

## Transaction boundary

Все paths исполнения выключены: V1 capabilities, Trading Routes, portable adapters и старый `executeSwap` fail closed до wallet/provider/build calls. Никаких real buys, sells, signatures или private keys в тестах не использовалось.

`inspectUnsignedTrade` декодирует настоящие VersionedTransaction bytes, ограничивает размер/u64 amount/quote lifetime/slippage/fees, проверяет required signer/fee payer, rejects pre-signed bytes и unresolved lookup tables. System transfers и неизвестные programs не допускаются без декодированной проверки recipient/spend. Это предварительный отказной validator, **не завершённый DEX execution adapter**. Quote-to-instruction amounts/accounts/approvals, simulation, aggregate fee computation и adapter tests ещё нужны для исполнения. Даже корректно декодированные bytes получают `allowed:false`.

Jupiter quote responses проходят exact mint/input amount/output bounds checks и allowlist mapping. Transaction/requestId/provider extras не доходят до signing path. Local slippage floor явно является оценкой, не гарантированным execution minimum. Signature status — только наблюдение введённой пользователем транзакции, не доказательство принадлежности или соответствия intent.

## Data and application boundaries

- Only Solana mainnet/base58; регистр адресов сохранён. RPC account program/type/owner/mint проверяются; null/malformed portfolio data не считается нулевым балансом.
- Fixed provider hosts исключают произвольный server-side URL input. User social links валидируются, не загружаются автоматически. Text рендерится как React text, без исполнения HTML.
- New import payloads ограничены по размеру/количеству/типам/допустимым identifiers. CSV quotes и formula prefixes экранируются. Imported journal executions всегда manual.
- Нет browser server credentials. Optional OpenAI key, model и Upstash limits принадлежат серверу. Модель не может подписывать транзакции; tools bounded/strict/read-only. Workspace proposals проходят отдельный validator и видимый Apply/Cancel.
- Открытый public wallet не аутентифицирует пользователя. Анонимные records принадлежат browser origin; shared private account API и облачная wallet ownership auth не созданы.
- Clear local module data удаляет доступные LocalStorage/IndexedDB данные и сбрасывает открытые Fable conversations, journal/alerts/intelligence state. Опции appearance и основной desk layout сохраняются.

## Extension permissions

Manifest V3: `activeTab`, `scripting`, `contextMenus`, `sidePanel`, `storage`; fixed API hosts, без `<all_urls>` и без automatic content scripts. Чтение visible text только по явному действию и разрешению Chrome. Captured text ограничен 16,000 символами и 30 минутами в session storage; есть Clear. Unsupported/denied page access отображается ошибкой. Service-worker suspension не трактуется как постоянно работающий backend.

Проверено реальное unpacked extension с worker/SidePanel и fixture provider responses. Нативный OS right-click menu и grants произвольной пользовательской страницы остаются ручной проверкой, а не фиктивным автоматическим PASS.

## Dependency and residual review

`npm audit --omit=dev` выявил **4 moderate, 0 high/critical** через существующий `@solana/web3.js` dependency chain (`jayson`, `stream-json`, `uuid`). Автоматическое предложенное major обновление Solana SDK не выполнялось. Пакеты не объявлены полностью безопасными; требуется отдельная проверка совместимости для такого обновления. Deployment безопасности не подтверждает одно отсутствие high-severity advisories.

Остаточные ограничения:

- Public providers могут ограничивать scans/историю; нет paid indexer coverage и полного creator/transfer index.
- В production optional AI требует настроенный persistent limiter; локального memory limit недостаточно для нескольких server instances.
- Stop отменяет provider request и UI updates; часть ограниченных бесплатных read-tool fetches может завершиться после отмены, так как общий orchestration ещё не передаёт AbortSignal каждому адаптеру.
- Нет полного penetration test, формального аудита Solana DEX adapters, signer simulation или multi-user authorization, поскольку execution/account service не включены.
- Foreground notifications не гарантируют единственного монитора между несколькими одновременно открытыми вкладками или доставку 24/7.

Исправленные при QA дефекты: replay accounting IDs; malformed balance → ложный $0; cross-mint snapshot crash; OR preset edit; provenance/cooldown уведомлений; устаревший quote после смены intent; repeated runner mount; server relative history URLs; negative-cache recovery. Проверки отражены в [TAIL_TEST_RESULTS.md](TAIL_TEST_RESULTS.md). Production не публиковался.
