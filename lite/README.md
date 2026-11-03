# SaveUp Lite

A cheap, minimal end-to-end version of SaveUp built from the Obsidian notes, so the idea can be tried on a phone quickly. **Plaid Sandbox only** (fictional banks). Independent of `mvp/`, except that it reuses `mvp/phone-preview.mjs` for the phone link.

## Run

1. Put Sandbox keys in `lite/.env.local` (ignored by Git): `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV=sandbox`.
2. `npm run lite` serves http://127.0.0.1:4193 (loopback only).
3. `npm run lite:phone` prints a private HTTPS link that expires after 8 hours. It needs `cloudflared` at `%LOCALAPPDATA%\SaveUp\tools\cloudflared.exe` or at `CLOUDFLARED_PATH`. Never commit the link.
4. `npm --prefix lite run check` runs syntax checks and ledger tests.

Data is a JSON file at `%LOCALAPPDATA%\SaveUp\lite-sandbox\state.json` (override with `SAVEUP_LITE_DATA`). Access tokens are stored there and are never sent to the browser.

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
