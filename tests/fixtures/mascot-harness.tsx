import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { TailMascot } from "../../src/mascot/react/TailMascot";
import type {
  TailMascot as Actor,
  TailState,
} from "../../src/mascot/runtime/tail-mascot.mjs";

const state: any = {
  actor: null,
  mounts: 0,
  unmounts: 0,
  errors: [],
  created: 0,
  closed: 0,
  pending: new Set<number>(),
};
(window as any).mascotQA = state;
const bitmap = window.createImageBitmap.bind(window);
window.createImageBitmap = (async (...args: any[]) => {
  const image = await (bitmap as any)(...args);
  state.created++;
  const close = image.close.bind(image);
  let closed = false;
  image.close = () => {
    if (!closed) {
      closed = true;
      state.closed++;
    }
    close();
  };
  return image;
}) as any;
const frame = window.requestAnimationFrame.bind(window),
  cancel = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => {
  const id = frame((t) => {
    state.pending.delete(id);
    callback(t);
  });
  state.pending.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => {
  state.pending.delete(id);
  cancel(id);
};
const connect = (actor: Actor) => {
  state.actor = actor;
  state.mounts++;
  return () => {
    state.unmounts++;
  };
};
function Harness() {
  const [mounted, mount] = useState(true),
    [reduced, reduce] = useState(false),
    [pose, change] = useState<TailState>("idle");
  state.mount = mount;
  state.reduce = reduce;
  state.pose = change;
  return (
    <>
      <div id="host" style={{ width: 128, height: 128 }}>
        {mounted && (
          <TailMascot
            size={128}
            state={pose}
            reducedMotion={reduced || undefined}
            connect={connect}
            onError={(error) => state.errors.push(error.message)}
          />
        )}
      </div>
      <p>Component lifecycle test fixture</p>
    </>
  );
}
const root = createRoot(document.getElementById("qa-root")!);
root.render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
