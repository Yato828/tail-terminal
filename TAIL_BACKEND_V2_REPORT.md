# TAIL 2.0 — backend and integration report

## Release boundary

V2 добавляет функции в существующий React/TypeScript терминал. Backend V1 сохранён. Новый backend, база или отдельный frontend с нуля не создавались. Production и другие Vercel projects не менялись.

Исходное незакоммиченное дерево сохранено до разработки: `/private/tmp/tail-v2-baseline-20261117/workspace.tar.gz`, SHA-256 `0173c285ee6862b1995decf1152f9f26089e9ee1801c6a192825ec01f4284cf9`. Архив защищён правами и не входит в downloadable/release artifacts. Рабочая ветка: `codex/tail-v2-20261117`; исходный HEAD: `e0f9660fd990e8e0bc41514d536bacbd2158491c`.

Точное значение исходного HEAD хранится в защищённом `head.txt`; рабочее дерево было важнее старого коммита. Изолированный scaffold и worktrees применялись только для разработки. Результаты принимались по согласованным файлам, без reset/stash исходных изменений.

## API map

| Interface | Implementation | Behavior |
|---|---|---|
| `/api/v2/capabilities` | Edge handler, общий dev/preview router | GET-only, no-store, Solana, browser storage, optional AI, execution false |
| `/api/astra/status` | Существующий server handler | Честная готовность AI и rate-limiter, без server credentials |
| `/api/astra/chat` | Responses API orchestration | JSON или явный SSE, bounded history/tools/output, actual usage |
| `/api/astra/scenario` | Существующий отдельный сценарный путь | Только по запросу, явно гипотетический ряд отдельно от source OHLC |
| `/tail-api/*` с `VITE_TAIL_API_URL` | Существующий Backend V1 | Старые market/wallet/session/alert/quote/Fable contracts сохранены |
| Standalone default | `src/services/backend/portable.ts` | Public-source read adapters и browser-owned watchlists/alerts, без локального server process |
| `/dex`, `/candle`, `/gecko`, `/paprika`, `/rpc`, `/rpc-backup`, `/jupiter`, `/ray`, `/rugcheck` | Фиксированные upstream rewrites/proxies | Нет произвольного upstream URL от пользователя |

Extension обращается к фиксированным публичным providers напрямую; optional Fable использует разрешённый HTTPS origin. Same-origin website API не требует размещать credentials в браузере. Серверные tool reads используют абсолютные upstream URLs, а не относительные dev proxy paths.

## Contracts and safety

- `Evidence<T>` разделяет `value`, `source`, `observedAt`, `fetchedAt`, `status`, `note`. Отсутствующий event timestamp не подменяется временем запроса.
- Strict tool schemas не принимают дополнительные поля, произвольные URL, неподтверждённые действия или transaction signing. Все адреса Solana проверяются, case base58 сохраняется.
- `WorkspaceAction` допускает только открытие известных виджетов, изменение интервала, поиск, сравнение до четырёх mint и сохранение валидного filter preset. Настоящий modal Apply/Cancel нужен до применения.
- Один `ForegroundAlerts` и один `WorkspaceBridge` подключены на уровне терминала, а не в каждом виджете.
- Результаты устаревшего запроса quote отбрасываются после смены token/amount/side/wallet. Пустой token result больше не удерживает ручную попытку восстановления поиска.
- Все entry points исполнения выключены, включая сохранённый legacy `executeSwap`. Quote response не несёт executable transaction в UI.

## Persistence and authentication

Локально не обнаружены настроенные Neon/database, AI key и persistent Upstash limits; проверялось только наличие, без вывода значений. Поэтому используется разрешённый анонимный режим: IndexedDB `tail-workspace-v2` / `collections`, LocalStorage mirror и существующие versioned keys. Записи имеют parsers, caps и import validation. Clear local module data очищает доступные stores и сбрасывает открытые чаты/модули; appearance и основной layout сохраняются.

Browser ID и публичный wallet address не признаются идентичностью или авторизацией. SQL migrations, общие приватные API, cloud sync и signed-wallet challenge пока не реализованы, потому что аккаунтная модель и существующее подключение отсутствуют. Новая платная БД не создана.

Production AI по-прежнему закрыт при отсутствии persistent rate limiter. Локальная конфигурация server-only key возможна без обязательного AI для остальных функций. Нет browser BYOK vault и multi-user secret storage.

## Delivery and verification

Настроены реальные Codex project roles: architect, market, wallet intelligence, terminal features, extension/social, QA/security. Независимые специалисты работали с раздельным владением файлами; повторное ревью и тесты выполнял отдельный QA. Настройки пользователя вне проекта не менялись.

CI выполняет проверки без deployment credentials и без upstream/model доступа в fixture profiles. GitHub workflow не был отправлен или запущен автоматически. Реальные команды и ограничения: [TAIL_TEST_RESULTS.md](TAIL_TEST_RESULTS.md). Дальнейший production rollout требует согласования.
