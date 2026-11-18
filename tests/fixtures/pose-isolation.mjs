import { TailRenderer, loadRig } from "/src/mascot/runtime/renderer.mjs";
import { samplePose } from "/src/mascot/runtime/motion-core.mjs";
export async function probe() {
  const canvas = document.createElement("canvas");
  const renderer = new TailRenderer(
    canvas,
    await loadRig(new URL("/tail-mascot/", location.href)),
  );
  const pose = samplePose("idle", 0.75, 0.75),
    original = JSON.stringify(pose);
  try {
    renderer.resize(128, 128, 2);
    renderer.render(pose, 0.75);
    const before = canvas.toDataURL();
    renderer.resize(320, 320, 2);
    renderer.render(pose, 0.75, { presentation: "floating" });
    const changedPose = JSON.stringify(pose) !== original;
    const shadowAlpha = canvas.getContext("2d").getImageData(200, 596, 1, 1)
      .data[3];
    renderer.resize(128, 128, 2);
    renderer.render(pose, 0.75);
    return {
      changedPose,
      shadowAlpha,
      terminalIdentical: before === canvas.toDataURL(),
    };
  } finally {
    renderer.destroy();
  }
}
