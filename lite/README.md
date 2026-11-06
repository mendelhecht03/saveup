# SaveUp Lite

A cheap, minimal end-to-end version of SaveUp built from the Obsidian notes, so the idea can be tried on a phone quickly. **Plaid Sandbox only** (fictional banks). This is the only app in the repository.

## Run

1. Put Sandbox keys in `lite/.env.local` (ignored by Git): `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`. Optional: `ANTHROPIC_API_KEY` turns on AI budget suggestions (`SAVEUP_AI_MODEL` and `SAVEUP_RECEIPT_MODEL` pick the models; both default to the low-cost `claude-haiku-5-5`).
2. `npm start` serves http://127.0.0.1:4193 (loopback only).
3. `npm run phone` prints a private HTTPS link that expires after 8 hours. It needs `cloudflared` at `%LOCALAPPDATA%\SaveUp\tools\cloudflared.exe` or at `CLOUDFLARED_PATH`. Never commit the link.
4. `npm run check` runs syntax checks and ledger tests.

Data is a SQLite database (`node:sqlite`, built into Node 24) at `%LOCALAPPDATA%\SaveUp\lite-sandbox\saveup.sqlite` (override with `SAVEUP_LITE_DB`). The first time it runs, it copies in the old `state.json` from the same folder (or `SAVEUP_LITE_DATA`) and leaves that file alone. Access tokens are stored there and are never sent to the browser. Node prints an "experimental" warning for SQLite; it is safe here.

The rules shared by the server and the browser live in `public/logic/` (one file per topic: dates, transfers, suggestions, budgets, review, plans, sync), gathered by `public/logic.mjs`. `db.mjs` is storage and `ai.mjs` asks Claude for suggestions.

## Phone app

SaveUp installs on a phone like an app: its own icon, full screen, and a quick start even before the PC answers. It's a web app (manifest, service worker in `public/sw.js`, icons in `public/icons/app/`, redrawn with `public/icons/app/render-app-icons.ps1`), so there is no App Store step.

For a permanent address, `npm run phone:app` uses Tailscale: it gives this PC a private HTTPS address on your tailnet (`https://<pc>.<tailnet>.ts.net`) that only devices signed into your Tailscale account can open. It also adds `SAVEUP_PUBLIC_HOST` to `.env.local` so the app accepts that address; restart `npm start` afterwards. Then on the phone: install Tailscale, sign in, open the address, and choose Add to Home Screen (iPhone, Safari) or Install app (Android, Chrome). `tailscale serve reset` stops sharing. Money data is never cached on the phone; it always comes live from the PC, so the PC must be on with `npm start` running.

`npm run phone` still prints an 8-hour link for quick checks, but its address changes every time, so it isn't suitable for a home-screen app.

## Interface

One design system, no framework or build step. `public/ui/tokens.css` defines every color, type size, radius, shadow, spacing and motion value. `public/ui/components.mjs` and `components.css` hold the reusable pieces (cards, buttons, pills, chips, budget bar, list rows, sheets, nav, fields, empty states, toasts). `public/screens/*.mjs` build each screen only from those pieces, as plain functions of the data. Line icons are only for controls; content uses 3D icons (`ui/icons.mjs`, emoji placeholders until the real images exist). More › Design system shows every component.

## Test bank

The **SaveUp Test Bank** is a Plaid Sandbox custom user with checking, savings and a credit card and about 50 transactions written to test SaveUp's edge cases: repeat purchases (Kahan's $2.53), pending charges, refunds, Zelle/PayPal/Venmo and own-account transfers, subscriptions, an ATM withdrawal, payroll and charges that match the sample receipts. The scenarios live in `lite/sandbox/banks.mjs` and the receipts in `lite/sandbox/receipts.mjs`.

It is connected the same way a real bank would be, through the Plaid Link window:
1. `npm run seed:export` writes the bank to `qa/plaid-sandbox-user.json` (ignored by Git).
2. In the Plaid Dashboard, open Build > Sandbox (Sandbox Studio) > Users, create the user `saveup_test`, and paste the file as its JSON configuration. `roll_dates_forward` moves the dates to the day you connect, so this is a one-time step.
3. In SaveUp: More > Accounts > Connect a bank with Plaid, pick First Platypus Bank (custom users need a non-OAuth bank) and log in as `saveup_test` with any password.

For automated checks only, `npm run seed [-- --fresh]` still loads the same bank without the Link window.

## Included

- **Inbox:** the weekly (Sun–Sat) review bucket. Confirming is always deliberate: swipe right to confirm a suggestion, swipe left to scan the receipt, or tap to review. Suggestions come first from your own past choices for that merchant and amount, then from Claude (if `ANTHROPIC_API_KEY` is set), which reads the merchant, amount, Plaid's category and your budget descriptions. A suggestion is an outlined chip with a sparkle; a reviewed purchase shows a solid chip with a check. The guess is stored separately from the final category.
- **Essential** is a priority tag (the top stop of the priority slider), not a budget. An old *Essentials* budget becomes *Household*.
- **Transfers:** Zelle, PayPal and similar transfers count as nothing until marked Income, Spending or own-account.
- **Budgets:** presets plus custom ones (description required), each weekly, monthly or yearly. Shows the true % over 100. Pending money appears as a striped bar segment. Cards expand to show their purchases.
- **Receipts:** swipe a purchase left, tap Add receipt in its review, or tap Scan receipt to scan first. Take a photo, choose a file, use a sample digital receipt from the test bank, or split by hand. Claude reads the photo (needs `ANTHROPIC_API_KEY`; `SAVEUP_RECEIPT_MODEL` picks the model), or Azure AI Document Intelligence when `AZURE_DOCINTEL_ENDPOINT` and `AZURE_DOCINTEL_KEY` are set (`scripts/set-azure-keys.ps1` saves them; `SAVEUP_RECEIPT_READER=claude` or `azure` forces one). Azure reads the numbers but not your budgets, so you file each line in review. Check the items on the editable copy (toggle to the original photo), rename cryptic codes once per store, then confirm how it splits across budgets. Tax is shared across items so the split matches the charge to the cent; a difference from the bank charge must be assigned before confirming. Photos are stored next to the database in `receipts/`.
- **Hand-logged and scanned purchases:** card purchases count as pending until linked to their bank charge. When a charge arrives with the same amount within 7 days (or the same store and a close amount), the inbox shows "Looks like the same purchase" with **Link** / **Not a match**. Nothing links automatically; a different amount reopens review. Cash purchases count immediately.
- **Plans:** planned purchases with a low/high range, essential tag and budget.
- **Weekly review:** when a week is all reviewed, the inbox shows the review ring, any older purchases still waiting, and a budget overview with true percentages.
- **What if it costs…:** on a planned purchase, slide the price to see what it leaves in its budget. Budget room only, with a reminder that it isn't a cash check.
- **Preview screens** (drawn with sample data, clearly labelled, not connected yet): Subscriptions, IOUs, Cash withdrawals and Returns under More, Goals under Planned, and Settings.
- **History:** search across all transactions. **Banks:** connected only through Plaid Link (as a real bank would be), remove, manual sync, pull-to-refresh, and a stale-item sync every few hours.
- **Test lab:** sends custom charges through `/sandbox/transactions/create`. Only works for the `user_transactions_dynamic` test user, and Plaid rate-limits it.

## Deliberately skipped

Working IOUs, subscriptions, goals, cash splits and returns (drawn as previews only), AI assistant/MCP, email receipts, price tracking, visualizations, haptics, Production banks, sign-in/multi-user.

## Receipt reading

- Sample receipt images live in `sandbox/receipts/*.png`, drawn from `sandbox/receipts.mjs`. Redraw them on Windows with `powershell -NoProfile -ExecutionPolicy Bypass -File sandbox
eceipts
ender-samples.ps1`.
- `receipts/reader.mjs` sends a receipt photo to Claude and returns item lines in integer cents with a suggested budget per line. Suggestions never confirm anything.
- `receipts/azure.mjs` sends it to Azure's prebuilt receipt model instead (free tier: 500 pages a month) and returns the same shape, with no budgets.
- `npm run receipts:compare` scores Claude, Azure (if its keys are set) and Tesseract (if installed) against the sample receipts: exact lines, correct total, and time. Set `RECEIPT_MODEL` to try another model.
