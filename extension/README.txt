TAIL — Solana mainnet workspace / Extension companion

INSTALL IN CHROME, EDGE OR BRAVE
1. Extract this archive into a folder you will keep.
2. Open the browser's Extensions page (chrome://extensions in Chrome).
3. Enable Developer mode, click Load unpacked and select this folder.
   The selected folder must contain manifest.json.
4. Pin TAIL to the toolbar and open it.

Open Info for product details, workspace setup and installation instructions.
Use the popup for a quick look. Open full terminal opens the complete TAIL desk
in its own extension tab with the selected token and saved appearance.

SIDE PANEL (CHROME 116+)
Click Open companion side panel in the popup. It has independent token search,
source-confirmed market summaries, a compact source chart, shared watchlist,
public wallet inspection and manually supplied social notes.
The full popup and full extension workspace remain available.

Select public text, right-click and choose Analyze selected text / Solana CA
in TAIL. Or invoke TAIL on a normal HTTP(S) page and click Scan active page now.
Scanning reads up to 16,000 visible text characters only after an explicit action
and Chrome permission. Browser pages and the extension store are unsupported.
There are no automatic page content scripts or blanket webpage permissions.
Captured text is stored in extension session storage for at most 30 minutes;
Clear captured text removes it sooner. This storage survives worker suspension,
but does not survive browser-session end. Failed storage/access is shown in UI.

Detected base58 addresses are candidates, not proof of a token mint or social
endorsement. Only an exact Solana market lookup enables Open token in TAIL.
No X/Telegram feed is scraped, and saved social URLs are not fetched automatically.
Users may paste permitted public content, save local notes and import/export them.
The site and extension have separate storage; settings sync between this
extension's popup, companion and full tab, not between devices or the website.

Public market tools connect directly to the packaged, fixed public providers.
No local server, account or API key is needed for search, source-covered candles,
public wallet inspection, read-only quotes and workspace tools.

Layouts, watchlists and observed-price alerts are stored in this browser profile.
Alerts run while their monitored view is open. They are not a background service.
Public provider availability, coverage and rate limits may affect individual views.

Fable 5.2 is optional and requires the owner's configured hosted AI service and
production limits; its data tools remain available without a model request.
Transaction signing, buy/sell execution and autotrading are disabled.
TAIL never asks for a seed phrase or private key.

This is a direct ZIP release. It is not a Chrome Web Store listing.
