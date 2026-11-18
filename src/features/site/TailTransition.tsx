import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  PreferencesProvider,
  usePreferences,
} from "../preferences/preferences";
import { TailMascot } from "../../mascot/TailMascot";
import "./transition.css";

type Props = {
  direction: "enter" | "leave";
  ready: boolean;
  initial: boolean;
  onCovered: () => void;
  onDone: () => void;
};
const TIMING = { cover: 700, presentation: 1300, reveal: 900 };
export function TailTransition(props: Props) {
  return (
    <PreferencesProvider>
      <Transition {...props} />
    </PreferencesProvider>
  );
}
function Transition({ direction, ready, initial, onCovered, onDone }: Props) {
  const overlay = useRef<HTMLDivElement>(null);
  const { preferences } = usePreferences();
  const [reduce, setReduce] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const reduced = reduce || preferences.reducedMotion;
  const [phase, setPhase] = useState<"cover" | "hold" | "reveal">("cover");
  const [mediaFailed, setMediaFailed] = useState(false);
  const [presented, setPresented] = useState(false);
  useEffect(() => {
    const timer = setTimeout(
      () => setPresented(true),
      reduced ? 0 : TIMING.presentation,
    );
    return () => clearTimeout(timer);
  }, [reduced]);
  useEffect(() => {
    overlay.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      sync = () => setReduce(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (phase !== "cover") return;
    const timer = setTimeout(
      () => {
        onCovered();
        setPhase("hold");
      },
      reduced || initial ? 0 : TIMING.cover,
    );
    return () => clearTimeout(timer);
  }, [phase, reduced, initial, onCovered]);
  useEffect(() => {
    if (phase === "hold" && ready && presented) setPhase("reveal");
  }, [phase, ready, presented]);
  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = setTimeout(onDone, reduced ? 0 : TIMING.reveal);
    return () => clearTimeout(timer);
  }, [phase, reduced, onDone]);
  return (
    <div
      ref={overlay}
      tabIndex={-1}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Tab") event.preventDefault();
      }}
      className={`tail-transition tail-transition-${direction} phase-${phase}${initial ? " initial-entry" : ""}${reduced ? " reduced-motion" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={direction === "enter" ? "Opening terminal" : "Returning home"}
      data-direction={direction}
      data-phase={phase}
      style={
        {
          "--tail-cover-duration": `${TIMING.cover}ms`,
          "--tail-reveal-duration": `${TIMING.reveal}ms`,
        } as CSSProperties
      }
    >
      <span className="tail-transition-brand" aria-hidden="true">
        TAIL<span>✦</span>
      </span>
      <div className="tail-transition-scene">
        {!reduced && (
          <img
            className="tail-transition-sphere"
            src={
              mediaFailed
                ? "/hero/signal/transition-poster.png"
                : "/hero/signal/transition.gif"
            }
            width="600"
            height="600"
            alt=""
            onError={() => setMediaFailed(true)}
          />
        )}
        <div className="tail-transition-orbit" aria-hidden="true" />
        <div className="tail-transition-orbit second" aria-hidden="true" />
        <TailMascot
          state={
            direction === "enter"
              ? ready
                ? "welcome"
                : "loading"
              : "idle_stretch"
          }
          interactive={false}
          style={{ position: undefined, width: undefined, height: undefined }}
          className="tail-transition-mascot"
          reducedMotion={reduced}
        />
        <span className="tail-transition-star" aria-hidden="true">
          ✦
        </span>
      </div>
      <h2>{direction === "enter" ? "Welcome to TAIL." : "Back home."}</h2>
      {!ready && phase === "hold" && <p>Opening your workspace…</p>}
    </div>
  );
}
