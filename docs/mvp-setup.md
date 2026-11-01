# First MVP slice: connect → import → review

This is a **local, single-user development milestone**, separate from the static prototype. It supports Plaid Sandbox only. The initial slice proves that imported bank facts and your review choices survive reloads and restarts.

The agreed MVP is limited to **Plaid integration, the basic review inbox, and weekly category budgeting**. Figma supplies visual direction for those features; the full file is not an implementation checklist. Receipts/OCR, splits/IOUs, plans, subscriptions, AI assistance, and the other app screens are deferred.

## Start now, without credentials

In a terminal at `C:\dev\projects\saveup`, run:

```powershell
npm run mvp
```

Open **http://127.0.0.1:4188**, choose **Get started**, and **Load sample bank**. No dependency installation is needed; use Node.js 24 LTS.

Try this flow:

1. Open Freshmart, choose Essentials, write a comment, and confirm the review.
2. Reload the page: the category and comment remain saved.
3. Open Banks and choose **Simulate $30 → $32 posting**.
4. Return to the inbox. There is one $32 Freshmart charge, with your comment preserved, awaiting review again.
5. Explicitly classify the Zelle and savings transfers. Nothing becomes income/spending automatically.
6. Open My week to create weekly category budgets or edit their limits. View posted and pending spending separately, expand a category's reviewed purchases, and see remaining money or an overage. Starting category limits are examples.
7. Use All dates for imported history. Weekly limit comparisons appear only for a full Sunday–Saturday week, avoiding a comparison between months of spending and one weekly allowance.

The sample week is November 1–7, 2026, matching the Figma design. Sample fixtures pass through the same importer and database as Plaid responses, but make no network requests and are labeled Sample.

## Enable actual Plaid Sandbox requests

Create `mvp/.env.local` from `mvp/.env.example` if it does not exist. The setup may already have created the empty local file for you. Add your **Plaid client ID and Sandbox secret** from the [Plaid Dashboard](https://dashboard.plaid.com/overview). Never paste secrets into chat or commit them. Do not use Production credentials.

```dotenv
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox
PORT=4188
```

Stop and restart `npm run mvp` after changing configuration. Banks then enables:

- **Connect with Plaid Link:** opens the real Link SDK against Sandbox. Choose First Platypus Bank; Sandbox's standard test login is `user_good` / `pass_good`.
- **Create Sandbox test bank:** creates a test Item through Plaid's Sandbox API without the interactive Link flow.
- **Import latest Sandbox updates:** downloads added, modified, and removed transactions since the stored cursor.
- **Ask Sandbox for new transactions:** requests a refresh. New data is asynchronous; wait a moment and import again.

An empty initial response can mean Plaid is still preparing history. The connection remains saved so you can retry. Any failed connection is labeled with its error code on Banks. The app never falls back silently from Plaid to local samples.

Local setup status, November 1: Sandbox credentials were configured and Plaid successfully issued a Link token. The real Link window opened inside the app. The interactive test-bank completion, token exchange, and actual imported transaction history have not yet been verified together. Credentials remain only in the ignored local environment file.

## What is saved

The server stores SQLite data at `%LOCALAPPDATA%\SaveUp\sandbox-mvp` on Windows. Other platforms use `~/.local/share/SaveUp/sandbox-mvp`. This is outside the Git repository and the OneDrive project folder. `SAVEUP_DATA_DIR` can override the location.

The local `token.key` encrypts Item access tokens with AES-256-GCM before database storage. It must remain with the database to reopen connections. The database contains fictional transaction data in ordinary SQLite form; this is not whole-database encryption or a production secrets-management system.

The browser receives transaction facts, review choices, and connection status; it never receives the Plaid secret or access tokens. The server binds to `127.0.0.1` only, checks Host and Origin, and requires a same-origin anti-forgery token for writes. These controls support local development; they do not implement multi-user authentication.

Node 24 may print an experimental warning for its built-in SQLite module. No third-party database dependency is installed for this local milestone.

## Implementation and current limits

- `mvp/plaid.mjs`: Sandbox-only HTTP adapter and full-pagination sync collection.
- `mvp/store.mjs`: SQLite storage, separate bank facts and annotations, transfer rules, revision checks, and atomic cursor updates.
- `mvp/server.mjs`: local API, token exchange, encrypted-token handling, and static app serving.
- `mvp/public/`: responsive inbox, review, week totals, and bank controls.
- `mvp/tests/`: provider, persistence, rollback, and HTTP integration checks; `npm run check` runs these and the original prototype tests.

All pages in a sync update are collected before a database transaction commits the rows and cursor together. Mutation-during-pagination restarts from the original cursor. Pending-to-posted replacement uses Plaid's pending ID; notes survive, and changed amounts/currencies/accounts reopen review. Removed records remain stored but leave active totals. Stale review requests receive HTTP 409 rather than overwriting newer data.

USD review is supported first. Other currencies remain visible and excluded from USD totals. Inflows require classification; refund/IOU repayment matching is not implemented, so those can be left unresolved.

Verification on November 1: 29 tests cover the existing prototype (11) and MVP (18, including two phone-preview access tests). Chromium walkthroughs at 390px and 320px confirmed review persistence after reload, a single $32 posted replacement retaining the $30 pending purchase's comment, explicit own-account classification with neutral totals, and no horizontal overflow. Isolated budget QA confirmed editing a $25 limit, showing $30 pending as 120% used and $5 over, creating a $75 Groceries budget, and retaining both settings after reload. Referenced SVG assets loaded locally at their native dimensions. Real Plaid Sandbox Link-token requests succeeded locally and through the HTTPS phone bridge. Actual iPhone Safari and the complete interactive connection/exchange/import flow have not been verified by the agent.

This slice does **not include** hosted sign-in, webhooks, scheduled jobs, connection repair/removal, receipt uploads/OCR, item-level splits/IOUs, plans, or real banks. Budget intervals are weekly; rollover and monthly/yearly budgets are deferred. The older prototype still demonstrates some advanced UX ideas with mock data. An actual Sandbox call is verified only after credentials are supplied and a connection succeeds; mocked integration tests do not establish live connectivity.

## Figma and deployment

Design source: [SaveUp/Pocket mockup](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=0-1), Weekly inbox `2:29260` and Purchase review `2:29382`. The first slice adapts their colors, card geometry, review hierarchy, and locally downloaded SVG assets. The working brand in these frames is “pocket.” Navigation is limited to implemented Inbox, My week, and Banks; planned/guide/receipt screens are not presented as working features. Inter uses a system-font fallback when unavailable. This is not full design parity or an implemented AI guide.

The existing Sites phone preview still serves the older static prototype. No MVP deployment has been made. A public hosted MVP needs authenticated ownership, a durable hosted database, managed secrets, verified webhook handling, and an agreed host. Local SQLite must not be placed on an ephemeral serverless filesystem. GitHub Pages explicitly excludes `mvp/` and cannot run this backend.

Official references: [Sandbox](https://plaid.com/docs/sandbox/), [test credentials](https://plaid.com/docs/sandbox/test-credentials/), [Link](https://plaid.com/docs/link/web/), [Transactions Sync](https://plaid.com/docs/api/products/transactions/), [transaction states](https://plaid.com/docs/transactions/transactions-data/), [Node 24 SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).
## Temporary iPhone access

With `npm run mvp` running, run `npm run mvp:phone` in a second terminal. It needs Cloudflare's official `cloudflared` executable (Windows: `%LOCALAPPDATA%\SaveUp\tools\cloudflared.exe`; other locations: `CLOUDFLARED_PATH`). The helper prints a fresh private HTTPS link. Open the **complete link**, including `#key=...`, in iPhone Safari. Anyone with that complete link can access this Sandbox app, so keep it private.

The helper puts a separate authenticated proxy between the tunnel and the loopback-only app. A random access key unlocks a Secure, HttpOnly, SameSite cookie; unauthorized API requests and cross-origin writes are rejected. The app's existing CSRF checks remain active. The key stays in a URL fragment, is removed after opening, and is never committed; current link metadata is in ignored `qa/phone-preview.json`. No Plaid secret or database is uploaded. This shares the existing local data and saves, rather than creating another copy.

Keep the PC awake and both processes running. The preview expires after eight hours, and Ctrl+C in the phone-preview terminal stops access immediately. Restarting creates a new address and access key. This is temporary development access, not production hosting or full user-account authentication. Physical iPhone Safari and complete Plaid Link flows still require on-device verification.

