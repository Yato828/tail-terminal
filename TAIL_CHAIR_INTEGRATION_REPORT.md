# TAIL Chair — hero integration

18 ноября 2026. Локальная ветка `codex/tail-chair-20261118`. Production не публиковался.

Справа в hero установлен `TailChairMascot` из `TAIL_CHAIR_CODEX.zip`. Прочитана `TAIL_CHAIR_INTERACTIVE/CODEX_INSTALL_RU.md`, открыто автономное демо и просмотрены исходный runtime и утверждённая иллюстрация. В приложении работает предоставленный Canvas 2D runtime с отдельными PNG-слоями. Preview GIF/видео/`embedded.js` в приложение не импортированы.

## Изменённые файлы

| File | Change |
|---|---|
| `src/features/site/HeroMascot.tsx` | Только правая иллюстрация: предоставленный React-компонент, корректный `BASE_URL`, существующая настройка reduced motion |
| `src/features/tail-chair/src/tail-chair.mjs` | Исходный runtime с исправлениями отмены загрузки и пересчёта положения курсора при изменении геометрии |
| `src/features/tail-chair/src/tail-chair.d.mts` | Предоставленные типы, без изменения API |
| `src/features/tail-chair/react/TailChairMascot.tsx` | Предоставленная обёртка; обработка синхронной ошибки Canvas, fallback poster, подавление поздних updates после cleanup |
| `src/features/tail-chair/react/tail-chair.css` | Предоставленные локальные стили, без изменения общей дизайн-системы |
| `public/tail-chair/assets/` | Исходный manifest, шесть PNG-слоёв и poster; все восемь файлов совпадают с SHA-256 пакета |
| `src/features/tail-chair/tests/` | 20 исходных motion tests и 6 новых lifecycle/geometry tests |
| `tests/chair-hero.spec.ts`, `tests/fixtures/chair-harness.tsx` | Проверки фактической страницы и настоящего React lifecycle |
| `tests/site.spec.ts` | Ожидания правого hero обновлены; проверки прежнего терминального маскота и переходов сохранены |
| `scripts/tail-chair-review.mjs` | Локальная проверка сборки/CSP/base path, запись настоящего hero и измерение кадров |

Общий `site.css`, `TailSite.tsx`, остальные компоненты, backend/API, терминальная логика, расширение и зависимости не изменялись. По сохранённым до работы хешам из 278 существующих source/asset files изменён только `src/features/site/HeroMascot.tsx`. [Проверка границ](artifacts/tail-chair/scope-check.json).

## Поведение

Сохранены приближение курсора, слежение глазами и небольшой наклон головы, однократное приветствие при hover с cooldown, возврат к ноутбуку, scroll glance/throttle, отдельный клик и усиленная реакция на три быстрых клика, Tab/Enter/Space и touch. Вертикальный touch scroll не блокируется. Canvas сохраняет отношение 900/780. Кресло/ноутбук не анимируются как единый плавающий объект.

Персонаж останавливает RAF вне viewport и на событии скрытия документа. В reduced motion остаётся статичная поза с открытыми глазами, без постоянного RAF. Home → Terminal → Home сохраняет один chair instance; персонаж и анимации терминала продолжают пользоваться прежним runtime.

Исправлены только интеграционные дефекты предоставленного пакета:

1. Pending manifest/PNG loads отменяются при dispose; ошибка одного слоя освобождает остальные загрузчики. Unmount не создаёт поздних listeners/RAF.
2. Ошибка `getContext('2d')` перехватывается React-обёрткой; при ошибках Canvas/manifest/PNG сохраняется полноценный poster.
3. Scroll/resize/visibility/viewport resume повторно вычисляют близость по последним координатам. Курсор, оставшийся неподвижным при прокрутке, не держит ложный hover.

Тела `TailChairMotion`, `_layer`, `render`, `_star` совпадают с предоставленным кодом. Персонаж, слои и движения не перерисовывались и не создавались заново.

## Фактические проверки

| Check | Result |
|---|---|
| SHA-256 исходного архива | Все 33 записи предоставленного hash manifest совпали |
| `npm run typecheck` | Passed |
| `npm test` | 280 passed / 4 live skipped |
| `node --test src/features/tail-chair/tests/motion.test.mjs src/features/tail-chair/tests/lifecycle.test.mjs` | 26 passed |
| `tests/chair-hero.spec.ts` | 12 passed, чистый финальный запуск 35.3s |
| Existing site/landing/2D terminal mascot regressions | 23 passed |
| `npm run build` | Passed |
| Build с `--base=/chair-base/` | Passed; runtime/PNG загружены по prefix, HTTP 200 |
| Browser с неизменёнными CSP headers из `vercel.json` | Canvas готов, тройной клик работает, CSP/JavaScript errors отсутствуют |
| 390px mobile emulation | Пропорции сохранены, touch работает, горизонтального overflow нет |
| Левый блок до/после на 1440×900 | HTML, x/y/width/height и font size совпали |

Нативные pointer/scroll/click/keyboard/touch handlers и requestAnimationFrame работали в настоящем Chrome. В browser tests документная visibility проверка использует явное событие/fixture; отдельно проверена нативная остановка при уходе изображения из viewport. StrictMode и отмена ещё загружающегося PNG проверены через React mount/unmount. Для pending PNG используется отдельный fixture URL с исходными bytes, чтобы декодированное ранее изображение из кеша не обходило проверку.

В одном наблюдении idle на готовой странице получено 120 кадров за 2001ms, около **59.97 FPS**, DPR 1. Это результат конкретной проверки headless Chrome, без гарантии частоты на каждом устройстве.

## Результат и ограничения

- [Видео взаимодействий в настоящем hero](artifacts/tail-chair/hero-interactions.webm).
- [Desktop](artifacts/tail-chair/hero-desktop.png), [приветствие](artifacts/tail-chair/hero-wave.png), [три клика](artifacts/tail-chair/hero-delight.png), [mobile](artifacts/tail-chair/hero-mobile.png).
- [Сравнение левого блока](artifacts/tail-chair/copy-comparison.json), [built/base/CSP evidence](artifacts/tail-chair/built-review.json).
- Итоговые command logs: `artifacts/tail-chair/checks/`.

Визуально сверены supplied artwork и реальная страница; полное пиксельное совпадение всей страницы с reference screenshot не заявляется. Браузерные проверки выполнены в Chrome, мобильные — в эмуляции 390px. На реальных Safari/Firefox/телефонах отдельный прогон не выполнялся. При недоступном Canvas или PNG показывается статичный исходный poster. Новых сервисов, сетевых API, зависимостей или публикаций не добавлено.
