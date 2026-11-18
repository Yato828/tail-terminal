import { tailApiBase, tailStandalone } from "./config";
import { mintPath } from "./client";
import type { StreamSnapshot } from "./contracts";
type Listener = {
  snapshot: (data: StreamSnapshot) => void;
  error: (message: string) => void;
};
const channels = new Map<
  string,
  { source: EventSource; listeners: Set<Listener> }
>();
/** A shared SSE transport of HTTP-polled snapshots, never an on-chain price tick. */
export function subscribeBackendSnapshot(mint: string, listener: Listener) {
  if (tailStandalone()) {
    mintPath(mint);
    let stop: (() => void) | undefined,
      disposed = false;
    void import("./portableStream").then((m) => {
      if (!disposed) stop = m.subscribePortableSnapshot(mint, listener);
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }
  const path = mintPath(mint),
    key = `${tailApiBase()}:${mint}`;
  let channel = channels.get(key);
  if (!channel) {
    const source = new EventSource(`${tailApiBase()}/market/stream/${path}`, {
      withCredentials: false,
    });
    channel = { source, listeners: new Set() };
    channels.set(key, channel);
    const current = channel;
    source.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as StreamSnapshot;
        if (
          data.delivery !== "polling" ||
          (data.token && data.token.mint !== mint) ||
          !Number.isFinite(Date.parse(data.asOf))
        )
          throw new Error("Invalid snapshot");
        current.listeners.forEach((l) => l.snapshot(data));
      } catch {
        current.listeners.forEach((l) => l.error("Invalid polling snapshot."));
      }
    });
    source.addEventListener("error", () =>
      current.listeners.forEach((l) =>
        l.error("Backend polling feed unavailable; waiting for reconnect."),
      ),
    );
  }
  channel.listeners.add(listener);
  return () => {
    channel!.listeners.delete(listener);
    if (!channel!.listeners.size) {
      channel!.source.close();
      channels.delete(key);
    }
  };
}
