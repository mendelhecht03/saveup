# Current SaveUp state

Updated November 1, 2026. This file gives either coding assistant the current context without needing the other assistant's chat history.

## Current direction

**Focused Inbox only.** The user chose Design A and then removed the other concepts. Preserve inline categorization, expandable details for splits and IOUs, the sticky weekly reconciliation bar, and the icy-blue Friendly Spatial appearance.

The original [product specification](product-spec.md) describes a larger future product. Its wording is preserved; line endings were normalized so GitHub can display it correctly. The choices below describe this temporary prototype; they are not a claim that every financial policy in the future app has been settled.

## Implemented

- Eight fictional transactions in the October 25–31, 2026 sample week, with an adjustable date range.
- Inline category selection followed by explicit Review, and expandable transaction notes and priority.
- Separate pending/posted and reviewed/unreviewed states. Simulated posting replaces the pending record; an amount change sends it back for review.
- Explicit transfer classification: own accounts, incoming income, or outgoing expense. Unresolved transfers stay visible and excluded from income/spending.
- Editable receipt splits that reconcile to the cent, including named IOU portions. IOUs are local records, not payment requests.
- User-confirmed planned-purchase matching. Matching releases the reservation without adding a second expense.
- Weekly progress, posted/pending spending, budget percentages including overages, and remaining amounts before and after plans.
- User-confirmed manual cash entry, sample receipt scanning, browser-local persistence, reset, and local feedback notes.

## Deliberate limitations

No live banks, Plaid, server database, authentication implementation, real OCR/camera scan, email ingestion, refunds, IOU repayment, money movement, or locked savings. The app's state exists only in that browser's local storage. Editing the app does not sync financial records between devices.

Unreviewed purchases are excluded from budget totals with an incompleteness notice; reviewed pending purchases count provisionally. The mock weekly budget is $500, and price-range reservations use the midpoint. These are prototype assumptions to revisit before a real financial product.

The persisted key is `saveup-inbox-lab-v1`. The app uses the `focused` state and normalizes legacy comparison links. Preserve existing Focused progress when changing storage; do not remove compatibility merely to rename “concept” variables.

## Code and verification

`prototype/dist/app.js` owns the interface, `model.js` owns the ledger, and `style.css` owns the visual style. `dist` is hand-edited source, not generated output. The local server serves only that directory.

Ten model tests cover explicit review and transfers, pending replacement, exact splits, IOUs, planned matching, mock-state isolation, date filtering, and over-budget totals. A server regression test checks that missing/invalid URLs cannot stop the preview or expose files outside the app. Earlier Chromium walkthroughs covered the main flows at 390px and layout at 320px; the import also checked review persistence and progress at 390px. Actual iPhone Safari hardware has not been tested.

## Repository handoff

The Focused Inbox was imported from the separate Sites repository at commit `f251cfc61ddfa5143c21cfbcd381ed78dff7bcaf`. Browser code and font assets were copied unchanged; repository documentation and scripts were adapted. The local server was fixed to read files before sending success headers, so a missing file returns 404 instead of crashing. Its optional `PORT` setting supports isolated tests. The existing landing and privacy pages were preserved.

Future code changes belong here. The existing private Sites preview is a separately published snapshot; see [deployment notes](deployment.md). No auto-deployment from GitHub has been configured.
