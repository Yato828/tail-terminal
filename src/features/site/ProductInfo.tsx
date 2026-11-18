import { BrandStar } from "../../design-system/BrandStar";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { isExtension } from "../../lib/env";
import "./info.css";

const tabs = ["Overview", "Setup", "Install"] as const;

export function InstallationSteps() {
  return (
    <ol className="tail-install-steps">
      <li>
        <b>Extract the ZIP.</b>
        <span>Keep the extracted folder on your computer.</span>
      </li>
      <li>
        <b>Open the Extensions page.</b>
        <span>
          Chrome: <code>chrome://extensions</code>
          <br />
          Edge: <code>edge://extensions</code> · Brave:{" "}
          <code>brave://extensions</code>
        </span>
      </li>
      <li>
        <b>Enable Developer mode → Load unpacked.</b>
        <span>
          Select the folder containing <code>manifest.json</code>.
        </span>
      </li>
      <li>
        <b>Pin TAIL and open it.</b>
        <span>
          Use the popup for a quick look. Choose Open full terminal to continue
          in a full tab.
        </span>
      </li>
    </ol>
  );
}

export function InfoDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    tablist = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index + tabs.length - 1) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tablist.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next].focus();
  };
  return (
    <dialog
      ref={dialog}
      className="tail-info-dialog"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <button
        type="button"
        className="tail-info-close"
        aria-label="Close Info"
        onClick={onClose}
        autoFocus
      >
        ×
      </button>
      <header className="tail-info-heading">
        <BrandStar className="tail-info-mark" />
        <div>
          <h2 id={`${id}-title`}>Meet your workspace.</h2>
        </div>
      </header>
      <div
        className="tail-info-tabs"
        role="tablist"
        aria-label="Product information"
        ref={tablist}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${id}-panel`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(e) => navigate(e, i)}
          >
            {tab}
          </button>
        ))}
      </div>
      <section
        className="tail-info-content"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
      >
        {active === 0 ? (
          <>
            <h3>A home for your Solana research.</h3>
            <p>
              TAIL brings Solana mainnet markets, charts and on-chain research
              into a workspace you can arrange around the way you think. Use it
              on the website or keep it close in your browser toolbar.
            </p>
            <div className="tail-info-features">
              <article>
                <b>Read the market</b>
                <p>
                  Search tokens by name, ticker or mint. Explore real candles,
                  available history, liquidity and clearly labelled sources.
                </p>
              </article>
              <article>
                <b>Follow the context</b>
                <p>
                  Inspect public wallets, explore available holder data and
                  watch observed prices with in-app alerts.
                </p>
              </article>
              <article>
                <b>Make it your desk</b>
                <p>
                  Move, resize and pin panels. Save layouts and choose a dark
                  theme and your accent.
                </p>
              </article>
            </div>
            <p className="tail-info-note">
              Public market tools work without an account. Quotes are read-only;
              data coverage depends on the source. Fable 5.2 availability is
              shown in the terminal.
            </p>
            <details><summary>Privacy and data sources</summary><p>Market tools query public Solana RPC and market providers. Watchlists, notes, snapshots and journals are stored in this browser profile and are not a cross-device account. Fable 5.2 uses the owner's configured OpenAI API; messages and selected market context are sent only when you request AI analysis. Personal portfolio context requires your permission. No seed phrases or private keys are requested.</p></details>
          </>
        ) : active === 1 ? (
          <>
            <h3>Set up your workspace.</h3>
            <ol className="tail-install-steps">
              <li>
                <b>Find your first market.</b>
                <span>
                  Open the terminal. Search a token name or ticker, or paste its
                  Solana mint address, then select a market. Candles appear
                  after you make a selection.
                </span>
              </li>
              <li>
                <b>Choose your view.</b>
                <span>
                  Use 1m for a close look, All to load available history and
                  Latest to return to recent candles. Check the source,
                  timestamp and volume units beside the chart.
                </span>
              </li>
              <li>
                <b>Arrange your desk.</b>
                <span>
                  Choose Customize to move, resize or pin panels. In Settings,
                  choose your dark theme and accent, then save a named
                  workspace.
                </span>
              </li>
              <li>
                <b>Follow what matters.</b>
                <span>
                  Add tokens under Alerts or public addresses in Wallet Watch.
                  Observed-price alerts run while a monitored view is open.
                </span>
              </li>
            </ol>
            <p className="tail-info-note">
              Layout and appearance preferences are saved in this browser.
              Automatic source updates and reduced motion can be adjusted in
              Settings.
            </p>
          </>
        ) : (
          <>
            <h3>Keep TAIL in your toolbar.</h3>
            <p>
              Download the archive and install it once. Public market tools
              connect to their sources directly, with no local server to start.
            </p>
            {!isExtension() && (
              <a
                className="tail-info-download"
                href="/tail-extension.zip"
                download="tail-extension.zip"
              >
                Download extension ZIP <span aria-hidden="true">↓</span>
              </a>
            )}
            <InstallationSteps />
            <p className="tail-info-note">
              This is a direct ZIP release. To update an unpacked installation,
              replace its files and click Reload on the browser’s Extensions
              page. You can also use the full terminal on the website.
            </p>
          </>
        )}
      </section>
    </dialog>
  );
}
