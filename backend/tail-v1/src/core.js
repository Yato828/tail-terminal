// Shared read-only adapters also run inside the packaged browser extension.
function joinBytes(chunks) {
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function assert(condition, status, code, message) {
  if (!condition) throw new HttpError(status, code, message);
}
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function decodeBase58(v) {
  if (typeof v !== "string" || !v.length || v.length > 110) return null;
  let x = 0n;
  for (const c of v) {
    const i = alphabet.indexOf(c);
    if (i < 0) return null;
    x = x * 58n + BigInt(i);
  }
  let hex = x.toString(16);
  if (hex === "0") hex = "";
  if (hex.length % 2) hex = "0" + hex;
  const leading = v.match(/^1*/)?.[0]?.length || 0;
  return joinBytes([
    new Uint8Array(leading),
    Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16)),
  ]);
}
export function solAddress(v) {
  assert(
    typeof v === "string" &&
      v.length >= 32 &&
      v.length <= 44 &&
      decodeBase58(v)?.length === 32,
    400,
    "BAD_ADDRESS",
    "Invalid Solana 32-byte base58 address",
  );
  return v;
}
export function signature(v) {
  assert(
    typeof v === "string" && decodeBase58(v)?.length === 64,
    400,
    "BAD_SIGNATURE",
    "Invalid 64-byte transaction signature",
  );
  return v;
}
export function safeQuery(v, max = 80) {
  assert(
    typeof v === "string" && v.trim().length > 0 && v.trim().length <= max,
    400,
    "BAD_QUERY",
    "Invalid search query",
  );
  return v.trim();
}
export function rawAmount(v) {
  assert(
    typeof v === "string" &&
      /^[1-9][0-9]{0,19}$/.test(v) &&
      BigInt(v) <= 18446744073709551615n,
    400,
    "BAD_AMOUNT",
    "amount must be a positive integer in base units",
  );
  return v;
}
export function finiteNumber(v, defaultValue = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultValue;
}
export function boundedInt(v, d = 20, min = 1, max = 100) {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  assert(
    Number.isInteger(n) && n >= min && n <= max,
    400,
    "BAD_NUMBER",
    `Expected integer between ${min} and ${max}`,
  );
  return n;
}
export function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}
export async function readJson(req, limit = 32768) {
  assert(
    (req.headers["content-type"] || "").split(";")[0].trim() ===
      "application/json",
    415,
    "JSON_REQUIRED",
    "Content-Type must be application/json",
  );
  let size = 0,
    chunks = [];
  for await (const c of req) {
    size += c.length;
    assert(size <= limit, 413, "BODY_TOO_LARGE", "Payload limit exceeded");
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    assert(
      v && typeof v === "object" && !Array.isArray(v),
      400,
      "BAD_JSON",
      "Expected JSON object",
    );
    return v;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "BAD_JSON", "Invalid JSON body");
  }
}
export const now = () => new Date().toISOString();
export class Cache {
  constructor() {
    this.values = new Map();
    this.pending = new Map();
  }
  async get(key, ms, fn) {
    const x = this.values.get(key);
    if (this.values.size > 3000) {
      for (const [k, v] of this.values)
        if (v.until <= Date.now()) this.values.delete(k);
      if (this.values.size > 3000) this.values.clear();
    }
    if (x && x.until > Date.now()) return { ...x.data, cache: "hit" };
    if (this.pending.has(key)) return this.pending.get(key);
    const p = Promise.resolve()
      .then(fn)
      .then((data) => {
        this.values.set(key, { data, until: Date.now() + ms });
        return { ...data, cache: "miss" };
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }
}
export async function fetchJSON(
  url,
  {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 9000,
    fetchImpl = fetch,
    maxBytes = 1_500_000,
    signal,
  } = {},
) {
  assert(
    url instanceof URL && url.protocol === "https:",
    500,
    "INVALID_UPSTREAM",
    "Only fixed HTTPS upstreams allowed",
  );
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  timer.unref?.();
  try {
    const res = await fetchImpl(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal,
    });
    if (!res.ok)
      throw new HttpError(
        res.status === 429 ? 429 : 502,
        "UPSTREAM_ERROR",
        `${url.hostname} returned ${res.status}`,
        { upstreamStatus: res.status },
      );
    const len = Number(res.headers.get("content-length") || 0);
    assert(
      len <= maxBytes,
      502,
      "UPSTREAM_SIZE",
      "Upstream response too large",
    );
    const rd = res.body?.getReader();
    if (!rd) return await res.json();
    const chunks = [];
    let count = 0;
    while (true) {
      const { value, done } = await rd.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) {
        await rd.cancel();
        throw new HttpError(
          502,
          "UPSTREAM_SIZE",
          "Upstream response too large",
        );
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(new TextDecoder().decode(joinBytes(chunks)));
    } catch {
      throw new HttpError(
        502,
        "BAD_UPSTREAM_JSON",
        "Invalid upstream response",
      );
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (e?.name === "AbortError")
      throw new HttpError(504, "UPSTREAM_TIMEOUT", "Upstream timed out");
    throw new HttpError(
      502,
      "UPSTREAM_UNAVAILABLE",
      "Upstream temporarily unavailable",
    );
  } finally {
    clearTimeout(timer);
  }
}
export function rateLimiter(max = 90, windowMs = 60_000) {
  const counts = new Map();
  return (key) => {
    let x = counts.get(key);
    const t = Date.now();
    if (!x || x.until < t) {
      x = { count: 0, until: t + windowMs };
      counts.set(key, x);
    }
    x.count++;
    if (counts.size > 5000)
      for (const [k, v] of counts) if (v.until < t) counts.delete(k);
    return x.count <= max;
  };
}
export async function pause(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
