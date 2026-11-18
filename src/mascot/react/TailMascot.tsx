import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  createTailMascot,
  TailEventBridge,
  type TailMascot as TailActor,
  type TailState,
} from "../runtime/tail-mascot.mjs";
export interface TailMascotHandle {
  play(state: TailState): void;
  beginTask(id: string, state: TailState): void;
  stageTask(id: string, state: TailState): void;
  endTask(id: string, outcome?: TailState | "cancel"): void;
  setProgress(value: number | null): void;
}
export interface TailMascotProps {
  assetBase?: string;
  size?: number;
  state?: TailState;
  progress?: number | null;
  interactive?: boolean;
  autoSleepMs?: number;
  reducedMotion?: boolean;
  presentation?: "default" | "floating";
  className?: string;
  style?: React.CSSProperties;
  onReady?: () => void;
  onError?: (error: Error) => void;
  connect?: (actor: TailActor, bridge: TailEventBridge) => void | (() => void);
}
/** Copy runtime/ beside react/, and assets/ into public/tail-mascot/assets/. */
export const TailMascot = forwardRef<TailMascotHandle, TailMascotProps>(
  function TailMascot(
    {
      assetBase = "/tail-mascot/",
      size = 128,
      state,
      progress = null,
      interactive = true,
      autoSleepMs = 90000,
      reducedMotion,
      presentation = "default",
      className,
      style,
      onReady,
      onError,
      connect,
    },
    ref,
  ) {
    const mount = useRef<HTMLDivElement>(null);
    const actor = useRef<TailActor | null>(null);
    const bridge = useRef<TailEventBridge | null>(null);
    const latest = useRef({ state, progress, reducedMotion, onReady, onError });
    latest.current = { state, progress, reducedMotion, onReady, onError };
    const frame = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useImperativeHandle(
      ref,
      () => ({
        play(next) {
          actor.current?.setState(next, { force: true });
        },
        beginTask(id, next) {
          bridge.current?.begin(id, next);
        },
        stageTask(id, next) {
          bridge.current?.stage(id, next);
        },
        endTask(id, outcome = "success") {
          bridge.current?.end(id, outcome);
        },
        setProgress(value) {
          actor.current?.setProgress(value);
        },
      }),
      [],
    );
    useEffect(() => {
      if (!mount.current) return;
      const abort = new AbortController();
      let disposed = false;
      let disconnect: void | (() => void);
      let unsubscribe: (() => void) | undefined;
      setReady(false);
      setError(null);
      void createTailMascot(mount.current, {
        assetBase,
        interactive,
        autoSleepMs,
        reducedMotion,
        presentation,
        signal: abort.signal,
      })
        .then((instance) => {
          if (disposed) {
            instance.destroy();
            return;
          }
          actor.current = instance;
          bridge.current = new TailEventBridge(instance);
          const changed = (next: TailState) => {
            if (frame.current) {
              frame.current.dataset.state = next;
              frame.current.setAttribute("aria-label", `TAIL mascot: ${next}`);
            }
            instance.canvas.dataset.state = next;
          };
          unsubscribe = instance.subscribe(changed);
          if (latest.current.state)
            instance.setState(latest.current.state, { force: true });
          instance.setReducedMotion(latest.current.reducedMotion);
          disconnect = connect?.(instance, bridge.current);
          changed(instance.state);
          instance.setProgress(latest.current.progress);
          setReady(true);
          latest.current.onReady?.();
        })
        .catch((reason: unknown) => {
          if (disposed || abort.signal.aborted) return;
          disconnect?.();
          unsubscribe?.();
          bridge.current?.destroy();
          bridge.current = null;
          actor.current?.destroy();
          actor.current = null;
          const err =
            reason instanceof Error ? reason : new Error(String(reason));
          setError(err.message);
          latest.current.onError?.(err);
        });
      return () => {
        disposed = true;
        disconnect?.();
        unsubscribe?.();
        abort.abort();
        bridge.current?.destroy();
        bridge.current = null;
        actor.current?.destroy();
        actor.current = null;
      };
    }, [assetBase, interactive, autoSleepMs, connect, presentation]);
    useEffect(() => {
      if (state) actor.current?.setState(state, { force: true });
    }, [state]);
    useEffect(() => {
      actor.current?.setProgress(progress);
    }, [progress]);
    useEffect(() => {
      actor.current?.setReducedMotion(reducedMotion);
    }, [reducedMotion]);
    return (
      <div
        ref={frame}
        className={className}
        data-renderer="tail-2d"
        data-ready={ready}
        data-state="idle"
        data-presentation={presentation}
        style={{
          width: size,
          height: size,
          position: "relative",
          flexShrink: 0,
          ...style,
        }}
      >
        <div ref={mount} style={{ position: "absolute", inset: 0 }} />
        {!ready && (
          <img
            src={`${assetBase.replace(/\/$/, "")}/assets/rig/poster.png`}
            width={size}
            height={size}
            alt="TAIL assistant"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          />
        )}
        {error && (
          <span
            role="status"
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              fontSize: 10,
              color: "#d9a477",
            }}
          >
            Animation unavailable
          </span>
        )}
      </div>
    );
  },
);
