# Current SaveUp state

Updated November 1, 2026. This file gives either coding assistant the current context without needing the other assistant's chat history.

## Current direction

**Active MVP scope: Plaid (Sandbox, plus Production for Mendel's own accounts), a basic review inbox, weekly category budgets, and purchases logged by hand or from a receipt.** The Figma file is a visual reference for these core features, not a requirement to implement every screen. Shared splits/IOUs, planned purchases, subscriptions, AI/guide screens, and other advanced features are deferred. Focused Inbox remains the only inbox mode; preserve the icy-blue Friendly Spatial appearance.

The original [product specification](product-spec.md) describes a larger future product. Its wording is preserved; line endings were normalized so GitHub can display it correctly. The choices below describe this temporary prototype; they are not a claim that every financial policy in the future app has been settled.

## Manual purchases and Figma fidelity (Claude, November 1, 2026, branch `feature/plaid-production`)

Mendel asked for manual purchase entry and for the MVP to match the Figma frames that apply: Purchase review, Transfer review, Groceries budget, Create budget and Receipt review. There are no drawn frames for the inbox or the Home summary, so those use the same sizes and colors.

- **Add purchase** (on the Inbox and on each budget screen) opens the Receipt review layout without a photo: merchant, date, items with prices, tax and tip. The total is always items + tax + tip. Each item can go to its own budget or stay "Same as purchase". A scanned receipt opens the same screen and checks the lines against the printed total.
- **Match with a bank charge** toggle. On: the purchase is saved as unverified spending and watched. Before saving, the app checks whether the charge is already in the inbox and offers "Match to transaction". Attaching moves the items onto that charge's review, so it counts once. Off: the purchase is recorded now (cash, gift card) and never matched. Logged purchases appear under "Logged by you" and can be edited or deleted until they are matched.
- **Per-item budgets:** `splitByCategory` in `budget-math.js` divides the bank amount (or the logged total) between budgets in proportion to their items, with largest-remainder rounding, so the parts always add up exactly. A discount cannot push a budget below zero. Linked receipts keep their split when a pending charge posts, and an amount change still reopens review.
- **Screens:** Home lists budget tiles. Each opens a Groceries-style detail screen: remaining amount, bar, legend, formula, "Purchases this week" and Add purchase. Create/Edit budget follows the Create budget frame but stays weekly-only. Monthly, yearly and custom intervals are still deferred, so they are not shown. Purchase review gains:
  - an editable merchant title
  - an optional 1–5 priority
  - the "Add a receipt" row (scan, or enter by hand)
  - "A suggestion, not a decision", which prefills the category from the same merchant's reviewed history; only the confirm button saves

  The header shows just the logo and avatar (plus a Live pill in Production). Navigation is Home / Inbox / More (banks). Plans and Guide stay hidden until they exist.
- **Server:** `POST /api/receipts/check` reports matching charges and possible duplicates without saving. `/api/receipts/save` accepts an `id` to edit an unmatched purchase. Reviews can store an optional `priority`.

Tested: 33 MVP and 11 prototype tests pass. The 5 new tests cover exact splits, per-item budgets, editing and un-watching, matching a logged purchase onto the Target charge (counted once, $8.71 + $2.29), and the HTTP check endpoint. In Chromium, with an isolated data folder and no Plaid credentials, two flows were run at 390px: logged purchase → match → review → budget, and a cash entry. Every screen was checked for horizontal overflow at 320px. Not tested on a real iPhone or with real Production data.

## Real-bank mode (Claude, November 1, 2026, branch `feature/plaid-production`)

Mendel asked to use his real accounts and confirmed his Plaid team is approved for Production. `PLAID_ENV=production` now selects `https://production.plaid.com` (the adapter accepts only the fixed Sandbox and Production hosts). Each SQLite folder records its environment on first use and refuses the other, and folders that existed before this label stay Sandbox. Production stores accept only `access-production-` tokens and no sample fixtures, the server rejects the demo, test-bank and Sandbox refresh endpoints, and a linked bank is named from Plaid Link's institution metadata. The Banks screen in Production shows only Connect and Import. Setup steps and known gaps are in `docs/mvp-setup.md`.

Tested: 32 automated tests pass (3 new ones cover the host allow-list, folder/environment separation including legacy folders, and Production endpoint blocking and token exchange). The Production Banks screen was checked at 390px with an isolated folder. **Not yet done:** an actual Production Link connection and import. That requires Mendel to put the Production secret into `mvp/.env.local` himself. Still missing for real-bank use: a reconnect flow (`ITEM_LOGIN_REQUIRED`), a disconnect button, webhooks, and encryption of the transaction data itself.

**Data-folder caveat:** Codex runs as a packaged Windows app, so its `%LOCALAPPDATA%` writes are redirected to `AppData\Local\Packages\OpenAI.Codex_…\LocalCache\Local\SaveUp`. The existing Sandbox database, its key and `cloudflared.exe` are there, not in `%LOCALAPPDATA%\SaveUp`. Set `SAVEUP_DATA_DIR` (and `CLOUDFLARED_PATH` for the phone helper) explicitly so either assistant or a normal terminal uses the same files.

## Figma polish pass (Claude, November 1, 2026)

Visual-only changes to `mvp/public/app.js`, `style.css` and five new icons (`arrow-left`, `check`, `pencil`, `right`, `shield`). No server, store, Plaid or budget-math changes. Compared against the Figma Purchase review, Transfer review and Groceries budget frames (the "Weekly inbox" link `2:29260` opens an empty wrapper, so the inbox has no drawn Figma frame to match).

- **Purchase review:** "← Back", a remaining-count subtitle, a Date row with the full date, account + status row, a pencil icon on "What did you buy?", a custom chevron select, and a confirm button that names the choice ("✓ Confirm Essentials"). The button text only reflects the selection; saving still requires pressing it.
- **Transfer review:** "What's this money for?" heading, a peach "Purpose unverified" card, a shield notice, and radio cards with a title, a hint, and a blue border when selected. The confirm label follows the chosen purpose.
- **Date picker:** one card reading "Sun, Nov 1 – Sat, Nov 7" with a previous-week arrow and a chevron that opens From/Through dates plus This week, All dates and Next week. Date fields stack at narrow widths.
- **Budget cards:** a large remaining (or over) amount with an icon tile, a "Spent or pending / $limit" row with the true percentage, the posted/pending bar, a dot legend, and reviewed purchases shown as merchant rows.
- **General:** 16px form text (stops iPhone Safari zooming into fields), 28px card corners, softer shadows, and gray inactive nav icons.

Tested: all 29 automated tests pass. In Chromium with an isolated data folder (Mendel's saved data untouched), at 390px and 320px: purchase review and confirm, transfer view, week picker arrows/toggle, budget cards including a 253% overage, and no horizontal overflow on inbox, review, transfer or My week. Not tested on real iPhone Safari. Inter is not bundled; iPhones show the system font (SF), which is close to the Figma type.

## New MVP foundation

Temporary phone access is available with `npm run mvp:phone` while the MVP server runs. It uses a Cloudflare Quick Tunnel to a separate authenticated loopback proxy, leaving the main server's Host/Origin/CSRF protections intact. The complete private fragment-key link unlocks an eight-hour Secure/HttpOnly cookie. Unauthorized API requests, invalid origins, and expired access are covered by automated tests. HTTPS access to the current app data and a real Sandbox Link-token request were verified through the tunnel; actual iPhone Safari remains to be checked by Mendel. See `docs/mvp-setup.md` for restart/stop instructions. Links are ephemeral and must never be committed.

Mendel requested a clearly labeled GitHub checkpoint for Claude to continue. Read [Claude handoff](claude-handoff.md), including the Figma links, next visual-polish task, startup/test instructions, and exact verification limits. The MVP checkpoint is committed and pushed to `origin/feature/plaid-sandbox`. Continue on that branch; `main` is unchanged. This handoff does not authorize merging or public deployment.

Phone-access validation: all 18 MVP tests pass, including two proxy access tests. The inbox rendered through the HTTPS URL in the desktop browser. The optional Pages-output check could not run because no local `_site` build exists; no public landing-page assets or Pages configuration were changed for phone access.

The user authorized starting a working MVP with Plaid Sandbox on November 1, 2026 and supplied the [Figma app mockup](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=0-1). Development is in `C:\dev\projects\saveup` on `feature/plaid-sandbox`; pre-existing document consolidation and Mendel's AGENTS.md edits are preserved.

`npm run mvp` starts a separate local app at **http://127.0.0.1:4188**. It has a credential-free sample bank, Sandbox Link/token exchange and sync endpoints, persistent SQLite storage, encrypted Item tokens, deliberate transaction review, explicit transfer classification, date filtering, and weekly category budgets. Limits can be edited, custom categories created with a description, and posted/pending spending viewed separately. Overages retain their true amounts and percentages above 100%. Budget comparisons apply to Sunday–Saturday weeks; arbitrary date ranges still show spending totals without comparing them to a single weekly limit. See [MVP setup](mvp-setup.md) for implementation and limits. Actual Plaid connectivity requires locally supplied Sandbox credentials and has not been verified merely by passing the mocked integration tests.

The following sections describe the **older static prototype**, which still runs with `npm start` at port 4187 and remains on the existing private Sites preview. Its splits/IOUs/plans are mock UX and have not yet been ported into the durable MVP. No public MVP deployment or Production bank connection is configured.

Sandbox setup was completed locally on November 1: the SaveUp team's existing client ID and Sandbox secret are in the ignored `mvp/.env.local`, the server was restarted, and a real `/link/token/create` request succeeded. The real Plaid Link window opens in the app. Completing a test-bank connection and verifying its imported history remain the next end-to-end check; a successful Link-token request alone does not prove those steps.

## Older prototype: implemented

- Eight fictional transactions in the October 25–31, 2026 sample week, with an adjustable date range.
- Inline category selection followed by explicit Review, and expandable transaction notes and priority.
- Separate pending/posted and reviewed/unreviewed states. Simulated posting replaces the pending record; an amount change sends it back for review.
- Explicit transfer classification: own accounts, incoming income, or outgoing expense. Unresolved transfers stay visible and excluded from income/spending.
- Editable receipt splits that reconcile to the cent, including named IOU portions. IOUs are local records, not payment requests.
- User-confirmed planned-purchase matching. Matching releases the reservation without adding a second expense.
- Weekly progress, posted/pending spending, budget percentages including overages, and remaining amounts before and after plans.
- User-confirmed manual cash entry, sample receipt scanning, browser-local persistence, reset, and local feedback notes.

## Older prototype: walkthrough

Start locally using the [README](../README.md), or open the private phone preview linked there. Choose a category, then tap **Review** to confirm it; selecting a category alone does not reconcile a transaction. Expand **Details, splits & IOUs** for the additional controls. Unsaved detail edits survive collapsing and reopening a row during the current visit.

1. Review Kahan's under a budget and add a description such as “toothbrush.”
2. Review Trader Joe's while pending. Reopen it from Reviewed and simulate posting. A changed final amount requires review again.
3. Classify the Zelle and savings transfers explicitly. Bank settlement does not decide their financial purpose.
4. Expand Target, split the receipt, and assign the chocolate bar to Jamie. The IOUs tab shows the $4.49 portion separately from personal spending.
5. Confirm UNIQLO as the winter-coat plan. Its $125 reservation is released while the $119.90 expense remains once.
6. Visit My week for progress and budget totals. Reconciliation can reach 100% even while a transaction remains pending at the bank.

The information button offers an inbox reset, a shareable inbox URL, and local feedback notes to copy into a chat.

## Older prototype: limitations

No live banks, Plaid, server database, authentication implementation, real OCR/camera scan, email ingestion, refunds, IOU repayment, money movement, or locked savings. The app's state exists only in that browser's local storage. Editing the app does not sync financial records between devices.

Unreviewed purchases are excluded from budget totals with an incompleteness notice; reviewed pending purchases count provisionally. The mock weekly budget is $500, and price-range reservations use the midpoint. These are prototype assumptions to revisit before a real financial product.

The persisted key is `saveup-inbox-lab-v1`. The app uses the `focused` state and normalizes legacy comparison links. Preserve existing Focused progress when changing storage; do not remove compatibility merely to rename “concept” variables.

## Older prototype: code and verification

`prototype/dist/app.js` owns the interface, `model.js` owns the ledger, and `style.css` owns the visual style. `dist` is hand-edited source, not generated output. The local server serves only that directory.

Ten model tests cover explicit review and transfers, pending replacement, exact splits, IOUs, planned matching, mock-state isolation, date filtering, and over-budget totals. A server regression test checks that missing/invalid URLs cannot stop the preview or expose files outside the app. Earlier Chromium walkthroughs covered the main flows at 390px and layout at 320px; the import also checked review persistence and progress at 390px. Actual iPhone Safari hardware has not been tested.

Those walkthroughs included split validation and line editing, IOU drafts surviving collapse and neighboring reviews, changed-amount posting, plan matching, manual cash entry, and completion without double counting. Expanded receipt controls fit at both tested widths. Legacy comparison links retained existing Focused review data.

## Repository handoff

The Focused Inbox was imported from the separate Sites repository at commit `f251cfc61ddfa5143c21cfbcd381ed78dff7bcaf`. Browser code and font assets were copied unchanged; repository documentation and scripts were adapted. The local server was fixed to read files before sending success headers, so a missing file returns 404 instead of crashing. Its optional `PORT` setting supports isolated tests. The existing landing and privacy pages were preserved.

The design follows the original specification, earlier SaveUp brief and decision log, Main Chat, and Friendly Spatial prototype. The Nunito Sans fonts and their license came from that earlier prototype.

Future code changes belong here. The existing private Sites preview is a separately published snapshot; see [deployment notes](deployment.md). No auto-deployment from GitHub has been configured.
