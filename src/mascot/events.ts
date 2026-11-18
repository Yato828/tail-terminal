import type {
  TailMascot,
  TailEventBridge,
  TailState,
} from "./runtime/tail-mascot.mjs";

type Update =
  | { type: "begin"; id: string; state: TailState }
  | { type: "stage"; id: string; state: TailState }
  | { type: "end"; id: string; outcome: TailState | "cancel" };
type Notice = "ui:warning" | "settings:saved" | "transaction:confirmed";

/** Delivers actual task lifecycles. The supplied TailEventBridge owns priorities and motion. */
export class MascotActivity {
  private tasks = new Map<string, TailState>();
  private listeners = new Set<(update: Update) => void>();
  private greetingAt = -Infinity;
  begin(state: TailState, scope = "task") {
    const id = `${scope}:${crypto.randomUUID()}`;
    this.tasks.set(id, state);
    this.emit({ type: "begin", id, state });
    return id;
  }
  stage(id: string, state: TailState) {
    if (!this.tasks.has(id)) return false;
    this.tasks.delete(id);
    this.tasks.set(id, state);
    this.emit({ type: "stage", id, state });
    return true;
  }
  end(id: string | null | undefined, outcome: TailState | "cancel" = "cancel") {
    if (!id || !this.tasks.delete(id)) return false;
    if (outcome === "welcome") this.greetingAt = performance.now();
    this.emit({ type: "end", id, outcome });
    return true;
  }
  notify(name: Notice) {
    if (name !== "ui:warning" && this.tasks.size) return;
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent(name));
  }
  error() {
    const id = this.begin("analyzing", "failed-operation");
    this.end(id, "error");
  }
  connect = (actor: TailMascot, bridge: TailEventBridge) => {
    bridge.attach(window);
    for (const [id, state] of this.tasks) bridge.begin(id, state);
    if (!this.tasks.size && performance.now() - this.greetingAt < 3000)
      actor.setState("welcome");
    const receive = (update: Update) => {
      if (update.type === "begin") bridge.begin(update.id, update.state);
      else if (update.type === "stage") bridge.stage(update.id, update.state);
      else bridge.end(update.id, update.outcome);
    };
    this.listeners.add(receive);
    return () => {
      this.listeners.delete(receive);
    };
  };
  private emit(update: Update) {
    for (const receive of this.listeners) receive(update);
  }
}
export const mascot = new MascotActivity();
export function mascotAssetBase() {
  const base = import.meta.env.BASE_URL || "/";
  return new URL(`${base}tail-mascot/`, document.baseURI).href;
}
export const mascotPoster = () => `${mascotAssetBase()}assets/rig/poster.png`;
