import { useEffect, useState } from "react";
import { tailApi } from "../../services/backend/client";
export function BackendConnection() {
  const [text, setText] = useState("Checking connection…");
  useEffect(() => {
    let stopped = false;
    Promise.all([tailApi.health(), tailApi.capabilities()])
      .then(([h]) => {
        if (!stopped)
          setText(
            h.status === "ok"
              ? "Market connection is ready."
              : "Market connection is unavailable.",
          );
      })
      .catch(() => {
        if (!stopped)
          setText("Market connection is unavailable. Please try again later.");
      });
    return () => {
      stopped = true;
    };
  }, []);
  return (
    <section className="tail-settings">
      <h2>Connection</h2>
      <p role="status">{text}</p>
      <p>Source details are shown with each chart. Quotes are read-only.</p>
    </section>
  );
}
