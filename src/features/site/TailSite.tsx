import { mascotAssetBase } from "../../mascot/events";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  PreferencesProvider,
  usePreferences,
} from "../preferences/preferences";
import { TailBrand } from "../../design-system/brand";
import { TailLogo } from "../tail/Logo";
import { HeroMascot } from "./HeroMascot";
import { BrandStar } from "../../design-system/BrandStar";
import { SocialLinks } from "./SocialLinks";
import { InfoDialog, InstallationSteps } from "./ProductInfo";
import "../tail/tail.css";
import "./site.css";
export function TailSite({ onEnter }: { onEnter: () => void }) {
  return (
    <PreferencesProvider>
      <TailBrand>
        <Site onEnter={onEnter} />
      </TailBrand>
    </PreferencesProvider>
  );
}
function Site({ onEnter }: { onEnter: () => void }) {
  const { preferences } = usePreferences();
  const [install, setInstall] = useState(false),
    [interactive, setInteractive] = useState(false),
    [menu, setMenu] = useState(false),
    [info, setInfo] = useState(false);
  const launch = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onEnter();
  };
  return (
    <div
      className={`tail-site${preferences.reducedMotion ? " reduce-motion" : ""}`}
      id="top"
    >
      <a className="ts-skip" href="#site-content">
        Skip to content
      </a>
      <header className="tail-header ts-nav">
        <TailLogo
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        />
        <button
          className="ts-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          ☰
        </button>
        <nav aria-label="Site navigation" className={menu ? "open" : ""}>
          <a href="#workspace" onClick={() => setMenu(false)}>
            The workspace
          </a>
          <a href="#try" onClick={() => setMenu(false)}>
            Try it live
          </a>
          <a href="#extension" onClick={() => setMenu(false)}>
            Extension
          </a>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setInfo(true)}
          >
            Info
          </button>
          <SocialLinks />
        </nav>
        <a className="ts-button ts-small" href="/terminal" onClick={launch}>
          Open terminal <span aria-hidden="true">↗</span>
        </a>
      </header>
      <main id="site-content">
        <section className="ts-hero">
          <div className="ts-hero-copy">
            <p className="ts-category">Solana trading workspace</p>
            <h1>
              Follow your
              <br />
              <em>instinct</em>
              <BrandStar className="ts-title-star" />
            </h1>
            <p className="ts-lede">
              Solana charts, public wallets and market tools.
              <br />
              On the web, or a click away in your browser.
            </p>
            <div className="ts-actions">
              <button className="ts-button" onClick={() => setInstall(true)}>
                Get the extension <span aria-hidden="true">↓</span>
              </button>
              <a className="ts-text-link" href="/terminal" onClick={launch}>
                Explore the terminal <span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="ts-platforms">For Chrome, Edge and Brave</p>
          </div>
          <HeroMascot />
        </section>
        <section className="ts-workspace ts-section" id="workspace">
          <div className="ts-section-heading">
            <h2>
              Start with <em>the chart.</em>
            </h2>
            <p>
              Pick a Solana market. Read the candles, check the source and keep
              your research beside the chart.
            </p>
          </div>
          <figure className="ts-product-shot">
            <div className="ts-windowbar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <b>TAIL</b>
              <span>Preview</span>
            </div>
            <img
              src="/tail-site/terminal.png"
              width="1672"
              height="941"
              alt="TAIL terminal with real minute candles, market discovery and a customizable workspace"
              loading="lazy"
            />
            <figcaption>
              <span>Your workspace, arranged your way.</span>
              <a className="ts-text-link" href="/terminal" onClick={launch}>
                Open terminal <span aria-hidden="true">↗</span>
              </a>
            </figcaption>
          </figure>
          <div className="ts-features">
            <article>
              <BrandStar />
              <h3>Charts and history.</h3>
              <p>
                Search by name or mint. Inspect minute candles, available
                history, liquidity and source-labelled market data.
              </p>
            </article>
            <article>
              <BrandStar outline />
              <h3>Wallet research.</h3>
              <p>
                Watch public wallets, explore holder coverage and set
                observed-price alerts. Keep every source in sight.
              </p>
            </article>
            <article>
              <BrandStar />
              <h3>Your own layout.</h3>
              <p>
                Arrange, resize and pin your panels. Save your layout and tune
                the theme. Bring your workflow with you.
              </p>
            </article>
          </div>
        </section>
        <section className="ts-live ts-section" id="try">
          <div className="ts-live-heading">
            <div>
              <h2>
                Try the <em>terminal.</em>
              </h2>
            </div>
            <p>
              This is the real terminal. Search for a Solana token, open a chart
              and try the tools.
              <br />
              <a className="ts-text-link" href="/terminal" onClick={launch}>
                Give it the full screen ↗
              </a>
            </p>
          </div>
          <div className={`ts-live-frame${interactive ? " active" : ""}`}>
            <div className="ts-windowbar">
              <b>TAIL terminal</b>
              <span>
                {interactive ? (
                  <button onClick={() => setInteractive(false)}>
                    Close preview ×
                  </button>
                ) : null}
              </span>
            </div>
            {interactive ? (
              <iframe
                src="/terminal?embedded=1"
                title="Interactive TAIL terminal"
                allow="clipboard-write"
              />
            ) : (
              <div className="ts-live-start">
                <BrandStar className="ts-preview-star" />
                <h3>Open the web terminal.</h3>
                <p>Try the charts and tools without installing anything.</p>
                <button
                  className="ts-button"
                  onClick={() => setInteractive(true)}
                >
                  Start exploring <span aria-hidden="true">↗</span>
                </button>
              </div>
            )}
          </div>
        </section>
        <section className="ts-extension ts-section" id="extension">
          <div className="ts-extension-art">
            <div className="ts-browser-head">
              <i />
              <i />
              <i />
              <span />
              <b>✦</b>
            </div>
            <div className="ts-pocket">
              <b>
                TAIL
                <BrandStar />
              </b>
              <p>
                A quick look.
                <br />
                Or the full desk.
              </p>
              <span className="ts-pocket-shortcut">
                <span>↗</span> Open full terminal
              </span>
            </div>
            <img
              className="ts-pocket-companion"
              src={`${mascotAssetBase()}posters/sleep.png`}
              width="180"
              height="180"
              alt="TAIL resting beside the browser extension"
              loading="lazy"
            />
            <BrandStar className="ts-extension-star" />
          </div>
          <div>
            <h2>
              Your terminal.
              <br />
              <em>In your browser.</em>
            </h2>
            <p>
              One click from your toolbar. Take a quick look in the popup, then
              open the full desk in a tab. Market tools work straight after
              installation.
            </p>
            <button className="ts-button" onClick={() => setInstall(true)}>
              Download TAIL <span aria-hidden="true">↓</span>
            </button>
          </div>
        </section>
        <section className="ts-faq ts-section">
          <h2>Good to know.</h2>
          <details>
            <summary>Can I use it without the extension?</summary>
            <p>
              Yes. Open the terminal here or launch the interactive workspace
              above. It uses the same TAIL interface and tools.
            </p>
          </details>
          <details>
            <summary>Do I need an account or a server?</summary>
            <p>
              Public market tools, charts, layouts, watchlists and
              observed-price alerts work without an account. The standalone
              extension connects to public sources directly. Your saved data
              stays in this browser profile.
            </p>
          </details>
          <details>
            <summary>What is available in this version?</summary>
            <p>
              Solana discovery, real candles and available history, public
              wallet tools, source-dependent holder and trade views, read-only
              quotes, local alerts and workspace customization. Alerts run while
              a monitored view is open. Fable 5.2 availability is shown in the
              terminal. Signing, automated trading and background notification
              delivery are unavailable.
            </p>
          </details>
          <details>
            <summary>How do I install the ZIP?</summary>
            <p>
              Download and extract the archive. Open your browser's Extensions
              page, enable Developer mode and choose Load unpacked. Select the
              extracted folder containing manifest.json, then pin TAIL to the
              toolbar.
            </p>
            <button className="ts-text-link" onClick={() => setInstall(true)}>
              Open installation steps ↗
            </button>
          </details>
        </section>
      </main>
      <footer className="ts-footer">
        <b>
          TAIL<span>✦</span>
        </b>
        <p>
          Solana mainnet workspace
          <br />© {new Date().getFullYear()} TAIL
        </p>
        <a href="/terminal" onClick={launch}>
          Terminal ↗
        </a>
        <button onClick={() => setInstall(true)}>Download ↓</button>
        <a href="#top">Back to top ↑</a>
      </footer>
      {install && <Install onClose={() => setInstall(false)} />}
      {info && <InfoDialog onClose={() => setInfo(false)} />}
    </div>
  );
}
function Install({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ts-install"
      aria-labelledby="install-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <button
        className="ts-close"
        aria-label="Close installation"
        onClick={onClose}
        autoFocus
      >
        ×
      </button>
      <h2 id="install-title">Take TAIL with you.</h2>
      <p>Install TAIL in Chrome, Edge or Brave and pin it to your toolbar.</p>
      <a
        className="ts-button"
        href="/tail-extension.zip"
        download="tail-extension.zip"
      >
        Download extension ZIP <span aria-hidden="true">↓</span>
      </a>
      <InstallationSteps />
    </dialog>
  );
}
