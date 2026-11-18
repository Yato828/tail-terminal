# TAIL mascot event mapping

Обновление 16 ноября 2026: текущая реализация описана в [TAIL_FRONTEND_FIX_REPORT.md](TAIL_FRONTEND_FIX_REPORT.md) и [TAIL_MASCOT_MOTION_REPORT.md](TAIL_MASCOT_MOTION_REPORT.md). Этот документ сохраняет предыдущую спецификацию/проверку.

The dispatcher and priorities live in `src/mascot/state-machine/controller.ts`. Components do not maintain independent character image selections.

| Trigger | Dispatch / owner action | Actual integration |
| --- | --- | --- |
| Terminal opens | `APP_READY` → welcome | Once per terminal mount |
| Token query changes/search begins | `begin('search','searching')` | Debounced source search; superseded requests cannot update current results |
| Search settles | `end('search')` | Resumes other work or idle |
| Token selected | `begin('token','analyzing')` | Token snapshot fetch owns the analysis state |
| Snapshot settles | `end('token')` | No false success for a missing source |
| AI text entry | `TEXT_ENTRY` → typing | Short transient; cannot interrupt thinking/warning/error |
| Explicit Fable request | `begin('fable','thinking')` | Pending existing server request |
| Fable result | `end('fable','success')` | Only after a validated successful server response |
| Fable error | `end('fable','error')` | Error UI and temporary error pose |
| Stop / component unmount | Abort + `end('fable')` | No success on cancellation |
| Layout/preset saved | `WORKSPACE_SAVED` → success | Explicit saved action; storage failure displays a session-only error |
| Preference change | `WORKSPACE_SAVED` → success | Existing preference store persists; storage errors remain visible |
| Idle for 90s | `USER_IDLE` → sleep | Runs only when higher-priority state permits |
| Renewed activity | `USER_ACTIVE` → wake | Keyboard, pointer down or throttled pointer motion |
| Confirmed buy | `TX_CONFIRMED` → success | Existing executeSwap resolves after confirmation; clicking Buy or receiving a signature is insufficient |
| Failed buy | `TX_FAILED` → error | Existing execution rejection path |
| Motion studio controls | Forced `transitionTo` | Explicit manual review mode, not a fabricated backend event |

`AI_TOOL_CALL`, `ALERT_RECEIVED`, `SEARCH_END` and `TOKEN_READY` are public dispatcher contracts. The current backend returns a completed JSON response, not intermediate tool-call events. Consequently the frontend does not pretend to observe live tool execution. No background alert provider was connected. Other intelligence modules retain their working analysis behavior without fabricating a new progress feed.

Controller arbitration blocks lower-priority events during warning/error and resumes active owner work afterward. A completed search cannot dismiss Fable thinking, and typing cannot dismiss a warning. Demo force transitions are intentionally explicit so reviewers can inspect any state immediately.
