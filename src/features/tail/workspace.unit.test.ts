import { expect, it } from "vitest";
import { parseDesk, preset, WIDGETS } from "./workspace";
it("recovers corrupt persisted layouts and clamps untrusted sizes", () => {
  expect(parseDesk({ version: 9 }).active).toBe("Default");
  const d = parseDesk({
    version: 1,
    active: "bad",
    layouts: [
      {
        id: "mine",
        name: "Mine",
        order: ["chart", "fake", "chart"],
        hidden: ["fake", "trade"],
        pinned: null,
        widths: [99999, -1],
        heights: { chart: 200, fable: "700", nope: 500 },
      },
    ],
  });
  expect(d.active).toBe("mine");
  expect(d.layouts[0].order).toHaveLength(WIDGETS.length);
  expect(d.layouts[0].hidden).toEqual(["trade"]);
  expect(d.layouts[0].widths).toEqual([500, 200]);
  expect(d.layouts[0].heights).toEqual({ chart: 200 });
});
it("presets allocate fresh editable state", () => {
  const a = preset(),
    b = preset();
  a.hidden.push("chart");
  expect(b.hidden).toEqual([]);
});
