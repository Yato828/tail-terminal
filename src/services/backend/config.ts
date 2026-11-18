import { isExtension } from "../../lib/env";
export const tailStandalone = () =>
  !String(import.meta.env.VITE_TAIL_API_URL ?? "").trim() &&
  (isExtension() || import.meta.env.VITE_TAIL_STANDALONE === "1");
/** Explicit server integration takes priority; standalone builds use browser-owned storage and public sources. */
export function tailApiBase(): string {
  if (tailStandalone()) return "browser-local";
  const raw = String(import.meta.env.VITE_TAIL_API_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return "";
  if (
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("?") &&
    !raw.includes("#")
  )
    return raw;
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("TAIL API requires HTTPS or an explicit loopback URL.");
  return raw;
}
export const tailBackendEnabled = () => Boolean(tailApiBase());
