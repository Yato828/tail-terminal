# TAIL 2.0 — wallet and on-chain intelligence

## Wallet tools

Wallet Intelligence расширяет существующий `part.wallets.v1`: labels, groups, colors, favorite, tracking history и безопасный exact-case parser. Activity использует до 12 confirmed signatures за страницу и не более двух detail requests одновременно. Результаты разделяются между потребителями и дедуплицируются.

SPL/Token-2022 balance deltas вычисляются через raw BigInt с проверкой mint/owner/decimals, учитывают появление и закрытие token accounts. Native SOL delta включает fee/rent/refund, поэтому не объявляется объёмом покупки. Failed/missing transaction и timestamps остаются явными. Program фильтруется по реально перечисленным transaction programs.

Wallet Overlap находит exact mint в активности нескольких выбранных адресов и исключает повторное включение одного wallet/event. Это наблюдаемое совпадение, а не доказательство общих владельцев. Smart Money остаётся просмотром наблюдаемой активности; win rate, trade frequency, historical profit ranking и подтверждённые buy/sell не вычисляются из net movement.

## Portfolio and accounting

Portfolio читает SOL и parsed SPL/Token-2022 accounts с проверкой envelope/program/owner/mint, агрегирует raw units и получает максимум 12 current market marks по два запроса одновременно. Ошибочный/null balance не превращается в полный пустой кошелёк стоимостью $0. Непокрытые позиции, unknown marks и известная оценённая часть отделены. История и holdings экспортируются в CSV.

Автоматическая реконструкция полной стоимости входа и PnL не завершена: ограниченный signatures scan не даёт верифицированную полную execution history и все historical prices. Такие поля в Portfolio остаются Unknown.

Доступен отдельный **Manual journal accounting** внутри Trade Journal. Он выключен до явного включения. Пользователь подтверждает полноту history от нулевого opening balance; направление transfers задаётся явно. Ручные inputs, imported signatures и вычисления не называются wallet executions. Method — weighted average cost:

- Multiple buys добавляют quantity и известную USD consideration/fee; partial sell снимает пропорциональную среднюю стоимость.
- Incoming transfer имеет неизвестную историческую basis; outgoing transfer уменьшает inventory без вымышленной реализации.
- Missing opening inventory, execution price, fee, quantity или transfer direction делают затронутые величины unavailable.
- Exact decimal rational arithmetic применяется к сохранённым десятичным значениям. Повтор entry ID не удваивает inventory/fees. Известный flat boundary не используется для восстановления неизвестного opening inventory без доказательств.
- SOL network fees представлены отдельно; без USD historical conversion они не вычитаются как будто это доллары. Rent/account closure не считаются доходностью.
- Current market mark имеет source/freshness, ручной mark явно подписан. Уже потерянная при ручном вводе точность JS number не восстанавливается.

## Security, holders and Bubble Map

Security проверяет подтверждённый mint account program/type, mint/freeze authority, supply/decimals и extensions, действительно возвращённые RPC parser. Present authority означает capability, а не доказанную атаку. Raw market evidence сохраняет missing liquidity и независимые timestamps. Pool mapping индексатора может отличаться от chart pool; он подписан отдельно.

Holder scope — крупнейшие до 20 token accounts, сгруппированные по владельцам. Парсер проверяет exact mint у каждого resolved account. RPC fallback — RugCheck с проверкой report mint и отдельной атрибуцией. Concentration — приблизительная доля полученной выборки относительно отдельно полученного supply. Unresolved owners/unknown index time/partial coverage видимы.

Существующая Bubble Map сохранена. Добавлены 10/20, fullscreen, shift-pan, сохранение/сброс camera/layout, address hover/list и sample concentration/time. Transfer relationships и beneficial ownership не выводятся из размеров пузырьков. Это не официальный сервис Bubblemaps и не полный holder index.

Creator identity, Developer DNA, связанные launches, liquidity locking и proof-based migration timeline **не реализованы** без достоверного индекса. Mint authority и metadata update authority не считаются автоматически creator.

## Token Memory and social

До 240 snapshots сохраняют price/liquidity/market cap/volume/holder sample с per-field evidence и отдельным local save time. Новые записи используют raw snapshots; неизвестные legacy-normalized нули не принимаются за измерения. Старый формат читается совместимо. Сравнение только одного exact mint, cross-mint selection блокируется. Clear-data отменяет pending save, чтобы запрос не восстановил удалённые записи.

Social Notes принимает предоставленный X/TG text, извлекает валидные base58 candidates и проверяет exact Solana market match. Notes/links имеют bounded import/export; внешние ссылки не загружаются автоматически. Нет scraping, глобальной X feed или верифицированного social sentiment score.

Результаты численных, негативных RPC и browser проверок: [TAIL_TEST_RESULTS.md](TAIL_TEST_RESULTS.md).
