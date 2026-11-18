import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mint = "So11111111111111111111111111111111111111112",
  pool = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE";
const data = new Map<string, string>();
const fetchMock = vi.fn();
let portable: typeof import("./portable");
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
beforeEach(async () => {
  vi.resetModules();
  data.clear();
  fetchMock.mockReset();
  vi.stubEnv("VITE_PART_SHELL", "ext");
  vi.stubEnv("VITE_TAIL_API_URL", "");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  vi.stubGlobal("fetch", fetchMock);
  portable = await import("./portable");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses the exact website RPC rewrite without a trailing slash", async () => {
  vi.stubGlobal('window', {});
  vi.stubEnv("VITE_PART_SHELL", "web");
  fetchMock.mockImplementation(async (_u, init) => {
    const body = JSON.parse(init.body);
    return json({
      jsonrpc: "2.0",
      id: body.id,
      result:
        body.method === "getBalance" ? { value: 1000000000 } : { value: [] },
    });
  });
  expect(await portable.portableRequest(`/wallet/${mint}`)).toMatchObject({
    address: mint,
    sol: "1",
  });
  expect(fetchMock.mock.calls).toHaveLength(3);
  expect(fetchMock.mock.calls.every((c) => c[0] === "/rpc")).toBe(true);
});
it('uses absolute fixed upstreams when a standalone Fable tool runs on the server', async()=>{
  vi.stubEnv('VITE_PART_SHELL','web');
  vi.stubEnv('VITE_TAIL_STANDALONE','1');
  fetchMock.mockResolvedValue(json({success:true,chain:'solana',mint,interval:'5m',source:'birdeye',volumeUnit:'token',candles:[{time:1700000100,open:1,high:2,low:0.5,close:1.2,volume:42}]}));
  const result=await portable.portableRequest(`/market/pool/${pool}/ohlcv?token=${mint}&interval=5m&limit=20`) as any;
  expect(result.source).toBe('Candle / Birdeye');
  expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
  expect(fetchMock.mock.calls.every(c=>new URL(String(c[0])).protocol==='https:')).toBe(true);
});
it("runs validated minute history directly against the public source without localhost or server keys", async () => {
  fetchMock.mockResolvedValue(
    json({
      success: true,
      chain: "solana",
      mint,
      interval: "1m",
      source: "birdeye",
      volumeUnit: "token",
      candles: [
        {
          time: 1700000000,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.2,
          volume: 42,
        },
      ],
    }),
  );
  const result = (await portable.portableRequest(
    `/market/pool/${pool}/ohlcv?token=${mint}&interval=1m&limit=500`,
  )) as any;
  expect(result).toMatchObject({
    scope: "token",
    volumeUnit: "token",
    source: "Candle / Birdeye",
  });
  expect(result.candles[0]).toMatchObject({ volume: 42, volumeUsd: null });
  expect(new URL(fetchMock.mock.calls[0][0]).hostname).toBe("api.candle.tv");
  expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined();
});
it("persists local watchlists and one-shot observed-price alerts across a browser view reload", async () => {
  await portable.portableRequest("/watchlist", {
    method: "POST",
    body: JSON.stringify({ mint }),
  });
  const created = (await portable.portableRequest("/alerts", {
    method: "POST",
    body: JSON.stringify({ mint, direction: "above", priceUsd: 10 }),
  })) as any;
  portable.observeBrowserPrice(mint, 9);
  expect(
    ((await portable.portableRequest("/alerts/events")) as any).items,
  ).toHaveLength(0);
  portable.observeBrowserPrice(mint, 11);
  portable.observeBrowserPrice(mint, 12);
  vi.resetModules();
  portable = await import("./portable");
  expect(((await portable.portableRequest("/watchlist")) as any).items).toEqual(
    [mint],
  );
  expect(
    ((await portable.portableRequest("/alerts/events")) as any).items,
  ).toHaveLength(1);
  expect(
    ((await portable.portableRequest("/alerts")) as any).items[0].triggered,
  ).toBe(true);
  await portable.portableRequest(`/alerts/${created.alert.id}`, {
    method: "DELETE",
  });
  expect(
    ((await portable.portableRequest("/alerts")) as any).items,
  ).toHaveLength(0);
});
it("rejects invalid alerts, unavailable storage, unimplemented signing and unconfigured AI explicitly", async () => {
  await expect(
    portable.portableRequest("/alerts", {
      method: "POST",
      body: JSON.stringify({ mint, direction: "above", priceUsd: -1 }),
    }),
  ).rejects.toMatchObject({ code: "BAD_ALERT" });
  await expect(
    portable.portableRequest("/trade/execute", { method: "POST" }),
  ).rejects.toMatchObject({ code: "METHOD_NOT_ALLOWED" });
  await expect(
    portable.portableRequest("/fable/chat", { method: "POST" }),
  ).rejects.toMatchObject({ code: "AI_NOT_CONFIGURED" });
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("blocked");
    },
  });
  await expect(
    portable.portableRequest("/watchlist", {
      method: "POST",
      body: JSON.stringify({ mint }),
    }),
  ).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
});
it("validates public quotes and drops upstream transaction fields in the browser too", async () => {
  const output = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  fetchMock.mockImplementation(async (u) =>
    json(
      new URL(u).hostname === "api.jup.ag"
        ? {
            inputMint: mint,
            outputMint: output,
            inAmount: "1000",
            outAmount: "500",
            transaction: "never expose",
          }
        : { jsonrpc: "2.0", result: { value: { decimals: 6 } } },
    ),
  );
  const result = await portable.portableRequest(
    `/trade/quote?inputMint=${mint}&outputMint=${output}&amount=1000`,
  );
  expect(result).toMatchObject({
    executable: false,
    outAmount: "500",
    outputDecimals: 6,
  });
  expect(result).not.toHaveProperty("transaction");
  expect(
    fetchMock.mock.calls.every((c) => !String(c[0]).includes("localhost")),
  ).toBe(true);
});
