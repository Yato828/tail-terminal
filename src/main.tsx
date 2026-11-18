import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
const TailApp = lazy(() => import("./features/tail/TailApp"));
const Site = lazy(() => import("./features/site/TailExperience"));
const Legacy = lazy(() =>
  import("./components/Experience").then((m) => ({ default: m.Experience })),
);
// Retained landing/terminal route for compatibility and regression coverage.
const legacy = new URLSearchParams(location.search).get("legacy") === "1";
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<p>Loading workspace…</p>}>
    {legacy ? (
      <Legacy />
    ) : location.pathname === "/mascot" ? (
      <TailApp />
    ) : (
      <Site />
    )}
  </Suspense>,
);
