# Current SaveUp state

Updated November 1, 2026. This file gives either coding assistant the current context without needing the other assistant's chat history.

## Current direction

**Active MVP scope: Plaid Sandbox, a basic review inbox, and weekly category budgets.** The Figma file is a visual reference for these core features, not a requirement to implement every screen. Receipt scanning, splits/IOUs, planned purchases, subscriptions, AI/guide screens, and other advanced features are deferred. Focused Inbox remains the only inbox mode; preserve the icy-blue Friendly Spatial appearance.

The original [product specification](product-spec.md) describes a larger future product. Its wording is preserved; line endings were normalized so GitHub can display it correctly. The choices below describe this temporary prototype; they are not a claim that every financial policy in the future app has been settled.

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
