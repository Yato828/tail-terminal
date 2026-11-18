import type { WidgetId } from "./workspace";
import type { ModuleId } from "../workspace/store";
export type PanelId = ModuleId | "alerts" | "account";
export const labels: Record<WidgetId, string> = {
  pulse: "Market Pulse",
  smart: "Smart Money",
  trending: "Trending",
  chart: "Chart",
  trade: "Buy / Sell",
  fable: "Fable 5.2",
};
export const percent = (n?: number) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
