import type { StreamSnapshot } from "./contracts";
import { portableRequest } from "./portable";
type Listener = {
  snapshot: (data: StreamSnapshot) => void;
  error: (message: string) => void;
};
const channels = new Map<
  string,
  {
    listeners: Set<Listener>;
    timer?: ReturnType<typeof setTimeout>;
    closed: boolean;
  }
>();
export function subscribePortableSnapshot(mint: string, listener: Listener) {
  let channel = channels.get(mint);
  if (!channel) {
    channel = { listeners: new Set(), closed: false };
    channels.set(mint, channel);
    const current = channel;
    const tick = async () => {
      try {
        const r = (await portableRequest(`/market/token/${mint}`)) as {
          token: StreamSnapshot["token"];
          source: string;
          asOf: string;
        };
        if (!current.closed)
          current.listeners.forEach((l) =>
            l.snapshot({ ...r, delivery: "polling", pollIntervalMs: 15000 }),
          );
      } catch (e) {
        if (!current.closed)
          current.listeners.forEach((l) =>
            l.error(
              e instanceof Error
                ? e.message
                : "Public market source unavailable",
            ),
          );
      } finally {
        if (!current.closed) current.timer = setTimeout(tick, 15000);
      }
    };
    void tick();
  }
  channel.listeners.add(listener);
  return () => {
    channel!.listeners.delete(listener);
    if (!channel!.listeners.size) {
      channel!.closed = true;
      clearTimeout(channel!.timer);
      channels.delete(mint);
    }
  };
}
