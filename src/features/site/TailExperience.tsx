import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TailTransition } from "./TailTransition";
import { readTerminalLink } from "../../lib/siteLink";
import { TailSite } from "./TailSite";
import { mascot } from "../../mascot/events";
const Terminal = lazy(() => import("../tail/TailApp"));
const isTerminal = () =>
  location.pathname === "/terminal" || readTerminalLink(location.search).open;
export default function TailExperience() {
  const [entry] = useState(() => ({
    terminal: isTerminal(),
    embedded: new URLSearchParams(location.search).get("embedded") === "1",
  }));
  const [desk, setDesk] = useState(isTerminal),
    [armed, setArmed] = useState(isTerminal);
  const [initial, setInitial] = useState(entry.terminal && !entry.embedded);
  const [transition, setTransition] = useState<"enter" | "leave" | null>(
      entry.terminal && !entry.embedded ? "enter" : null,
    ),
    [ready, setReady] = useState(false);
  const embedded = new URLSearchParams(location.search).get("embedded") === "1";
  const boot = useRef<string | null>(null);
  useEffect(() => {
    if (armed && !ready && !boot.current)
      boot.current = mascot.begin("loading", "terminal-route");
    if ((ready || !armed) && boot.current) {
      mascot.end(boot.current, ready ? "idle" : "cancel");
      boot.current = null;
    }
  }, [armed, ready]);
  useEffect(
    () => () => {
      mascot.end(boot.current, "cancel");
    },
    [],
  );
  const site = useRef<HTMLDivElement>(null),
    terminal = useRef<HTMLDivElement>(null),
    focusAfterTransition = useRef(Boolean(transition));
  useEffect(() => {
    if (transition) {
      focusAfterTransition.current = true;
      return;
    }
    if (focusAfterTransition.current) {
      (desk ? terminal.current : site.current)?.focus({ preventScroll: true });
      focusAfterTransition.current = false;
    }
  }, [desk, transition]);
  useEffect(() => {
    const pop = () => {
      const terminal = isTerminal();
      if (
        terminal === desk &&
        (!transition || terminal === (transition === "enter"))
      )
        return;
      setInitial(false);
      if (terminal) {
        if (!armed) setReady(false);
        setArmed(true);
        setTransition("enter");
      } else setTransition("leave");
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [desk, armed, transition]);
  const enter = () => {
    if (transition) return;
    setReady(false);
    setInitial(false);
    setArmed(true);
    setTransition("enter");
  };
  const leave = () => {
    if (transition) return;
    setInitial(false);
    setTransition("leave");
  };
  const markReady = useCallback(() => setReady(true), []);
  const cover = useCallback(() => {
    const next = transition === "enter";
    setDesk(next);
    if (!next) setArmed(false);
    if (isTerminal() !== next)
      history.pushState({}, "", next ? "/terminal" : "/");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [transition]);
  const finish = useCallback(() => {
    setTransition(null);
    setInitial(false);
  }, []);
  return (
    <>
      <div
        ref={site}
        className="tail-site-route"
        tabIndex={-1}
        hidden={desk}
        inert={desk || !!transition}
      >
        <TailSite onEnter={enter} />
      </div>
      {armed && (
        <div
          ref={terminal}
          tabIndex={-1}
          className="tail-terminal-route"
          hidden={!desk}
          inert={!desk || !!transition}
        >
          <Suspense fallback={<p role="status">Opening TAIL…</p>}>
            <Terminal onHome={embedded ? undefined : leave} />
            <Ready onReady={markReady} />
          </Suspense>
        </div>
      )}
      {transition && (
        <TailTransition
          key={transition}
          direction={transition}
          initial={initial}
          ready={transition === "leave" || ready}
          onCovered={cover}
          onDone={finish}
        />
      )}
    </>
  );
}
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}
