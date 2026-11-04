# SaveUp Lite

A cheap, minimal end-to-end version of SaveUp built from the Obsidian notes, so the idea can be tried on a phone quickly. **Plaid Sandbox only** (fictional banks). This is the only app in the repository.

## Run

1. Put Sandbox keys in `lite/.env.local` (ignored by Git): `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`.
2. `npm start` serves http://127.0.0.1:4193 (loopback only).
3. `npm run phone` prints a private HTTPS link that expires after 8 hours. It needs `cloudflared` at `%LOCALAPPDATA%\SaveUp\tools\cloudflared.exe` or at `CLOUDFLARED_PATH`. Never commit the link.
4. `npm run check` runs syntax checks and ledger tests.

Data is a JSON file at `%LOCALAPPDATA%\SaveUp\lite-sandbox\state.json` (override with `SAVEUP_LITE_DATA`). Access tokens are stored there and are never sent to the browser.

## Interface

One design system, no framework or build step. `public/ui/tokens.css` defines every color, type size, radius, shadow, spacing and motion value. `public/ui/components.mjs` and `components.css` hold the reusable pieces (cards, buttons, pills, chips, budget bar, list rows, sheets, nav, fields, empty states, toasts). `public/screens/*.mjs` build each screen only from those pieces, as plain functions of the data. Line icons are only for controls; content uses 3D icons (`ui/icons.mjs`, emoji placeholders until the real images exist). More › Design system shows every component.

## Test bank

With the app running, `npm run seed` adds the **SaveUp Test Bank**: a Plaid custom Sandbox user with checking, savings and a credit card, and about 50 transactions dated relative to today. It covers repeat purchases (Kahan's $2.53), pending charges, refunds, Zelle/PayPal/Venmo and own-account transfers, subscriptions, an ATM withdrawal, payroll and charges that match the sample receipts. `npm run seed -- --fresh` removes earlier test banks first (banks added through Link stay). The scenarios live in `lite/sandbox/banks.mjs` and the receipts in `lite/sandbox/receipts.mjs`.

## Included

- **Inbox:** the weekly (Sun–Sat) review bucket. Confirming is always deliberate. Suggestions come from previously confirmed merchant and amount pairs.
- **Transfers:** Zelle, PayPal and similar transfers count as nothing until marked Income, Spending or own-account.
- **Budgets:** presets plus custom ones (description required), each weekly, monthly or yearly. Shows the true % over 100. Pending money appears as a striped bar segment. Cards expand to show their purchases.
- **Hand-logged purchases:** card purchases stay unverified until a bank charge with the exact amount arrives within 7 days, then they merge once. Cash purchases count immediately.
- **Plans:** planned purchases with a low/high range, essential tag and budget.
- **History:** search across all transactions. **Banks:** Plaid Link, an instant test bank, remove, manual sync, pull-to-refresh, and a stale-item sync every few hours.
- **Test lab:** sends custom charges through `/sandbox/transactions/create`. Only works for the `user_transactions_dynamic` test user, and Plaid rate-limits it.

## Deliberately skipped

Receipt OCR, IOUs/splits, subscriptions, AI assistant/MCP, email receipts, returns, price tracking, visualizations, haptics, Production banks, sign-in/multi-user.
