const paths: Record<string, string> = {
  search: "m21 21-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  pulse: "M4 19V9m6 10V4m6 15v-7m5 7V7",
  terminal: "m3 17 6-6 4 3 8-10m-6 0h6v6",
  intelligence: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  portfolio: "M3 6h18v14H3Zm0 4h18M16 14h3M5 3h13",
  alerts: "M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 4h4",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  user: "M4 22v-3a8 8 0 0 1 16 0v3M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  grid: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  close: "m5 5 14 14M19 5 5 19",
  pin: "m9 3 10 10-4 1-2 5-3-5-5-3 4-2Zm1 11-7 7",
  expand: "M14 3h7v7m0-7-8 8M10 21H3v-7m0 7 8-8",
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
