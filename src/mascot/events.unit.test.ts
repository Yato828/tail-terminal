import { afterEach, expect, it, vi } from "vitest";
import { MascotActivity } from "./events";
import {
  TailEventBridge,
  type TailMascot,
  type TailState,
} from "./runtime/tail-mascot.mjs";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const target = new EventTarget();
  vi.stubGlobal("window", target);
  const actor = {
    state: "idle" as TailState,
    director: { requestId: null as string | null },
    setState(state: TailState, options: { requestId?: string | null } = {}) {
      this.state = state;
      this.director.requestId = options.requestId ?? null;
      return true;
    },
    setProgress() {},
    subscribe() {
      return () => {};
    },
  };
  const bridge = new TailEventBridge(actor as unknown as TailMascot),
    events = new MascotActivity();
  const disconnect = events.connect(actor as unknown as TailMascot, bridge);
  return {
    events,
    actor,
    stop() {
      disconnect();
      bridge.destroy();
    },
  };
}
it("uses distinct request IDs and ignores stale completion after a replacement search", () => {
  const f = fixture();
  const first = f.events.begin("searching", "search");
  f.events.end(first, "cancel");
  const next = f.events.begin("searching", "search");
  expect(first).not.toBe(next);
  expect(f.events.end(first, "error")).toBe(false);
  expect(f.actor.state).toBe("searching");
  f.events.end(next, "idle");
  expect(f.actor.state).toBe("idle");
  f.stop();
});
it("replays tasks that began while PNG layers were loading and delegates concurrent priorities", () => {
  const f = fixture();
  f.stop();
  const ai = f.events.begin("thinking", "fable"),
    chart = f.events.begin("analyzing", "chart");
  const bridge = new TailEventBridge(f.actor as unknown as TailMascot);
  const disconnect = f.events.connect(f.actor as unknown as TailMascot, bridge);
  expect(f.actor.state).toBe("analyzing");
  f.events.end(chart, "success");
  expect(f.actor.state).toBe("thinking");
  f.events.stage(ai, "analyzing");
  expect(f.actor.state).toBe("analyzing");
  f.events.end(ai, "success");
  expect(f.actor.state).toBe("success");
  disconnect();
  bridge.destroy();
});
it("does not celebrate a saved preference during a pending operation and disconnects listeners", () => {
  const f = fixture();
  const task = f.events.begin("thinking", "fable");
  f.events.notify("settings:saved");
  expect(f.actor.state).toBe("thinking");
  f.stop();
  f.events.end(task, "success");
  expect(f.actor.state).toBe("thinking");
  window.dispatchEvent(new CustomEvent("ui:warning"));
  expect(f.actor.state).toBe("thinking");
});
