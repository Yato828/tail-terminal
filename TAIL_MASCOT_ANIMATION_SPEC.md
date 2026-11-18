# TAIL mascot animation specification

Обновление 16 ноября 2026: текущая реализация описана в [TAIL_FRONTEND_FIX_REPORT.md](TAIL_FRONTEND_FIX_REPORT.md) и [TAIL_MASCOT_MOTION_REPORT.md](TAIL_MASCOT_MOTION_REPORT.md). Этот документ сохраняет предыдущую спецификацию/проверку.

## Assets and runtime

The rig is the supplied `src/tail-mascot.svg` from the user's archive, copied without altering character geometry to `src/mascot/assets/tail-mascot.svg`. It contains separate hood/head, body, cloak, arms, two legs, eye expressions, shadow and tool overlays. It is a small two-legged hooded character; no tail, ears, animal reinterpretation or ordinary mouth was added.

`src/mascot/animations.js` derives from the supplied continuous JavaScript engine. `animations.d.ts` provides its TypeScript contract. `state-machine/controller.ts` provides the typed public state/event API and priority arbitration. `TailMascot.tsx` is the React integration and exports `useTailMascot`.

The trusted bundled SVG is inserted once on mount. React does not reconcile the engine-owned subtree on state changes. All instance IDs are namespaced; stable `data-tail-part` names let the engine resolve layers. This prevents duplicate gradient/part IDs and, critically, prevents a React render from discarding the currently animated rig. A browser regression test marks the SVG and proves the same node survives every requested transition.

## Channels and timelines

The persistent pose has numeric channels for whole-body translation/rotation/scale, head movement, independent arms and legs, cloak rotation, eye opening/shift/expression and overlay opacity. Keyframes interpolate through smoothstep. State entry blends from the exact current pose into the new timeline rather than resetting to a neutral image.

| Public state | Engine state | Behavior |
| --- | --- | --- |
| idle | idle | breathing, small sway, blink |
| welcome | welcome | raised arm and two wave gestures; ~2200ms |
| thinking | think | head tilt, eyes glance, hand-to-face pose; loops |
| analyzing | analyze | restrained chart panels and gestures; loops |
| searching | scan | scanning eye/head movement and scan indicator; loops |
| typing | type | laptop overlay, alternating arms; loops while selected |
| success | success | raised arms, small jump and landing; ~1650ms |
| warning | alert | restrained warning gesture; ~1800ms |
| error | error | lowered posture and head gesture; ~1950ms |
| sleep | sleep | lower compact posture, mostly closed eyes; loops |
| wake | wake | opens eyes, rises and stretches back toward neutral; ~900ms |

Standard entry blend is 480ms, sleep entry 680ms and success entry 330ms. Wake has explicit keyframes. One-shot states return to the highest-priority outstanding owner, otherwise idle. Transient typing returns after 1300ms. Replaying one-shots restarts them from the current pose; active loops do not unnecessarily restart.

## Arbitration and lifecycle

Priority is warning (9), error (8), analyzing/thinking (7), success (6), searching (5), typing (4), welcome (3), wake (2), idle (1), sleep (0). Idle can explicitly enter sleep. `begin(owner,state)` and `end(owner,outcome)` ensure search completion cannot dismiss an unrelated warning or AI request. Error/warning temporarily interrupt lower-priority work and then resume outstanding work.

The controller exposes `play`, `transitionTo`, `returnToIdle`, `dispatch`, `begin` and `end`. The application schedules sleep after 90 seconds without activity and wake after renewed keyboard/pointer activity. Pointer motion is throttled. The engine suspends requestAnimationFrame in hidden tabs or offscreen instances. Reduced motion honors both the OS preference and saved application preference; it renders stable poses and avoids continuous idle frames. No additional animation library was installed.

## Review and verification

Open `/mascot` for all eleven state buttons, five requested transition chains, a priority-interruption button, reduced-motion control and simultaneous large/small instances. A reset button clears outstanding demo work. Timers are cancelled on leaving the studio.

Automated browser coverage verifies every state, both feet, repeated transitions without replacing the SVG, interruption priority, stable reduced-motion transforms and hidden-document pause/resume. Unit tests exercise arbitration, warning/error retention, wake and repeated one-shots. These tests establish continuity/lifecycle behavior; they do not substitute for subjective artistic approval or claim measured 60fps on every device.
