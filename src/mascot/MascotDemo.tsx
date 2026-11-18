import { useEffect, useRef, useState } from "react";
import { TailMascot, type TailMascotHandle } from "./TailMascot";
import { mascotPoster } from "./events";
import type { TailState } from "./runtime/tail-mascot.mjs";
const MASCOT_STATES: TailState[] = [
  "idle",
  "idle_look",
  "idle_stretch",
  "welcome",
  "thinking",
  "analyzing",
  "searching",
  "typing",
  "success",
  "warning",
  "error",
  "sleep",
  "wake",
  "loading",
  "tap",
  "tickle",
  "secret",
];
const sequences: TailState[][] = [
  ["idle", "thinking", "analyzing", "success", "idle"],
  ["idle", "searching", "idle"],
  ["idle", "sleep", "wake", "idle"],
  ["idle", "warning", "idle"],
  ["idle", "error", "idle"],
];
const transitions: [TailState, TailState][] = [
  ["idle", "thinking"],
  ["thinking", "analyzing"],
  ["analyzing", "success"],
  ["success", "idle"],
  ["idle", "searching"],
  ["searching", "idle"],
  ["idle", "warning"],
  ["warning", "idle"],
  ["idle", "error"],
  ["error", "idle"],
  ["idle", "sleep"],
  ["sleep", "wake"],
  ["wake", "idle"],
];
export function MascotDemo() {
  const [state, setState] = useState<TailState>("idle");
  const actor = useRef<TailMascotHandle>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [reduced, setReduced] = useState(false),
    [playing, setPlaying] = useState("");
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying("");
  };
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      setState("idle");
    },
    [],
  );
  const play = (seq: TailState[], label: string) => {
    stop();
    setState("idle");
    setPlaying(label);
    seq.forEach((s, i) =>
      timers.current.push(setTimeout(() => setState(s), i * 2300)),
    );
    timers.current.push(setTimeout(() => setPlaying(""), seq.length * 2300));
  };
  return (
    <main className="mascot-lab">
      <header className="lab-header">
        <a href="/">← TAIL terminal</a>
        <span>TAIL / ORIGINAL ART / 2D</span>
      </header>
      <h1>One character. Continuous motion.</h1>
      <p className="lab-intro">
        The supplied PNG layers and Canvas runtime. All 17 states keep the same
        artwork and preserve pose and velocity through transitions.
      </p>
      <div className="lab-preview-grid">
        <div className="lab-stage">
          <TailMascot
            ref={actor}
            state={state}
            size={320}
            reducedMotion={reduced}
          />
          <div className="lab-size-preview">
            <img
              className="lab-small"
              src={mascotPoster()}
              alt="TAIL header poster"
              width="60"
              height="60"
            />
            <span>Header size</span>
          </div>
          <span className="lab-state" role="status">
            {state} {playing && `· ${playing}`}
          </span>
        </div>
        <aside className="lab-reference">
          <img
            src={mascotPoster()}
            alt="Approved TAIL idle pose supplied by the user"
          />
          <p>Approved character reference</p>
          <small>
            Provided poster. The character on the left uses the supplied 2D
            runtime.
          </small>
        </aside>
      </div>
      <section>
        <h2>States</h2>
        <div className="lab-controls">
          {MASCOT_STATES.map((s) => (
            <button
              key={s}
              aria-pressed={s === state}
              onClick={() => {
                stop();
                setState(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>
      <label className="lab-motion-toggle">
        <input
          type="checkbox"
          checked={reduced}
          onChange={(e) => setReduced(e.target.checked)}
        />
        Reduced motion
      </label>
      <section>
        <h2>Every required transition</h2>
        <p>
          Each button holds the first pose, then blends to the next. Interrupt
          it at any time with another state.
        </p>
        <div className="lab-transition-grid">
          {transitions.map(([from, to]) => (
            <button
              key={`${from}-${to}`}
              onClick={() => play([from, to], `${from} → ${to}`)}
            >
              {from} → {to}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Transition sequences</h2>
        <div className="lab-sequences">
          {sequences.map((seq, i) => (
            <button key={i} onClick={() => play(seq, seq.join(" → "))}>
              {seq.join(" → ")}
            </button>
          ))}
        </div>
      </section>
      <div className="lab-bottom-controls">
        <button
          onClick={() => {
            stop();
            actor.current?.beginTask("demo:analysis", "thinking");
            actor.current?.stageTask("demo:analysis", "analyzing");
            setState("analyzing");
          }}
        >
          Priority test: thinking → analyzing
        </button>
        <button
          onClick={() => {
            stop();
            actor.current?.endTask("demo:analysis", "cancel");
            setState("idle");
          }}
        >
          Reset / stop
        </button>
      </div>
    </main>
  );
}
