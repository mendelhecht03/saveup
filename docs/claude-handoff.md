# Claude handoff: Plaid Sandbox MVP and Figma polish

Prepared November 1, 2026. Work in **`C:\dev\projects\saveup`** on **`feature/plaid-sandbox`**. This is the shared checkout for Claude Code and Codex; the old OneDrive project folder is not the active codebase. Finish one assistant's work before starting the other in this folder.

## What Mendel wants next

Mendel says the app looks better in the Figma preview than the current implementation. Improve the visual fidelity of the **existing MVP's inbox, transaction review, and weekly budgeting**, while preserving the working Plaid Sandbox backend. He is trying it on his iPhone. Use the designs as the visual target, and check the same screens side by side. This is not a request to implement the entire Figma file.

Design source: **[SaveUp / pocket Figma designs](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=0-1)**.

- [Weekly inbox frame](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=2-29260) — node `2:29260`.
- [Purchase review frame](https://www.figma.com/design/NeCYcLrTSJtmH4k4ZhifxT/Untitled?node-id=2-29382) — node `2:29382`.
- Visual direction: icy blue background, floating white rounded cards, navy type, bright blue pills, gentle shadows, dimensional icons, generous touch targets. The Figma frames use the working brand **pocket**, while the project/repo is called SaveUp.
- **Focused Inbox only.** Do not restore alternative card-by-card or grouped modes.
- The existing implementation is an adaptation, not pixel-perfect Figma parity. Local Figma SVG assets are already in `mvp/public/assets/`.

Mendel has limited coding experience. Explain meaningful choices simply, ask about product tradeoffs when needed, and handle routine implementation without repeated permission requests.

## Which app to edit

| Location | Role | Command |
| --- | --- | --- |
| **`mvp/`** | **Active app: persistent inbox, weekly budgets, Plaid Sandbox** | **`npm run mvp` → `http://127.0.0.1:4188/`** |
| `prototype/dist/` | Earlier mock-data prototype with additional exploratory features | `npm start` → `http://127.0.0.1:4187/` |
| Root `index.html`, `privacy.html` | Existing public landing/privacy pages | Preserve these |

The existing `saveup-inbox-lab-mendel.mendelhecht770.chatgpt.site` preview serves the **older prototype**. A GitHub push does not update it. Do not mistake it for the backend-enabled MVP.

## Run and test

Use **Node.js 24 LTS**. The app itself has no npm dependencies or build step.

```powershell
cd C:\dev\projects\saveup
git status --short --branch
npm run mvp
```

Open `http://127.0.0.1:4188/`. Sample-bank fixtures work without credentials. Their week is November 1–7, 2026, so select that week or All dates if opening later. Do not reset Mendel's saved data to run UI checks; use an isolated `SAVEUP_DATA_DIR` and a separate port for destructive tests.

```powershell
npm run check
```

This runs 11 older-prototype tests and 18 MVP tests. For interface changes, inspect 390px and 320px widths and check for horizontal overflow. Desktop device emulation is not proof of iPhone Safari behavior.

## Plaid status and test credentials

- **Sandbox only.** The adapter rejects Production. No real bank credentials are needed.
- This PC already has the client ID and Sandbox secret in **ignored `mvp/.env.local`**. Preserve it. Another clone needs its own local configuration from `mvp/.env.example` and the [Plaid Dashboard keys page](https://dashboard.plaid.com/developers/keys).
- Do not print, commit, upload, or paste the secret, Item access tokens, database, or encryption key.
- Banks → **Connect with Plaid Link** opens the actual Plaid SDK. You can skip the optional phone prompt. Alternatively, test phone **`415-555-0133`**, verification code **`123456`**, is an official starter profile ([Plaid profiles](https://plaid.com/docs/sandbox/profiles/)). This profile may show saved test accounts.
- For a fresh manual bank connection, choose **First Platypus Bank**, username **`user_good`**, password **`pass_good`**. If the bank login requests a separate MFA code, use **`1234`** ([Plaid quickstart](https://github.com/plaid/quickstart#test-credentials)). The six-digit phone code and bank MFA code are different prompts.
- If history is not ready, retry **Import latest Sandbox updates**. The Item survives a failed initial sync. There is also a Sandbox test-bank endpoint that bypasses Link for development.

Verified: real Plaid Link-token creation with the local credentials, opening the actual Link window, and issuing a Sandbox Link token through the temporary HTTPS phone connection. **Not yet verified by the agent:** completing interactive Link, exchanging that real public token, and importing the resulting history together. Mendel may have completed this on his phone since the handoff was written; inspect the current connection status without modifying his records.

## iPhone preview

Keep `npm run mvp` running. In a second terminal:

```powershell
npm run mvp:phone
```

This uses the official `cloudflared` binary, already installed on this PC at `%LOCALAPPDATA%\SaveUp\tools\cloudflared.exe`. See [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/) on a new machine, or set `CLOUDFLARED_PATH` to its location.

The helper prints a new **private HTTPS link**, including a `#key=...` fragment. Open the complete link in iPhone Safari. It accesses the same local data and backend. Keep the PC awake and both processes running. The link expires after eight hours, changes on restart, and stops working when the helper is stopped with Ctrl+C. Do not commit the current URL/key or QR code. Current-session metadata is in ignored `qa/phone-preview.json`; it is local operational information, not a stable deployment URL.

The main server remains loopback-only. `mvp/phone-preview.mjs` adds a separate authenticated proxy with an expiring Secure/HttpOnly cookie, exact public Host/Origin validation, and retained upstream CSRF checks. Do not expose the original server directly or remove its checks to make phone access work. This is temporary development access, not production authentication or hosting.

## Files and rules to preserve

| File | Purpose |
| --- | --- |
| `mvp/public/app.js`, `style.css`, `index.html` | Active interface; start here for Figma polish |
| `mvp/public/budget-math.js` | Weekly totals and budget comparisons |
| `mvp/server.mjs` | Local HTTP API and Link/token exchange |
| `mvp/plaid.mjs` | Sandbox-only transport and paginated sync |
| `mvp/store.mjs` | SQLite, encrypted Item tokens, review rules, atomic imports |
| `mvp/phone-preview.mjs` | Temporary authenticated phone bridge |
| `mvp/tests/` | Ledger, persistence, provider, HTTP and preview access checks |

Use integer cents. A category choice does not confirm review; require deliberate confirmation. Keep pending/posted separate from reviewed/unreviewed. A changed final amount reopens review, preserves notes, and never duplicates the purchase. Transfers need explicit purpose and valid direction; own-account transfers are neutral. Only complete Sunday–Saturday ranges compare spending with a weekly budget. Preserve true overages above 100%. USD review is supported; other currencies remain excluded from USD totals.

SQLite and `token.key` live in `%LOCALAPPDATA%\SaveUp\sandbox-mvp`, outside the repo and OneDrive. Preserve both. The key encrypts Item tokens, not the whole database. There is no multi-user sign-in, webhook processing, scheduled sync, connection repair/removal, or Production-bank support yet.

Deferred features: receipt uploads/OCR, splits/IOUs, planned purchases, subscriptions, AI/guide, rollover, monthly/yearly budgets. Some are mocked in the old prototype; they are not implemented in this MVP.

## Repository state and next checkpoint

This handoff is part of the `feature/plaid-sandbox` checkpoint requested by Mendel for GitHub. Continue on that branch; do not merge into `main` or deploy the public website merely to work on the MVP. Check `git status` and the branch log for the actual commit/push state. A second local clone must fetch and switch to this branch; the existing shared checkout already has it.

The checkpoint includes the MVP, phone bridge, setup/design references, earlier documentation consolidation, and Mendel's existing AGENTS.md edits. The redundant `docs/working-with-agents.md` and `prototype/README.md` were consolidated into the root README and status docs; their deletions are intentional.

Validation at handoff: 29 automated tests pass; local and HTTPS inbox rendering verified; unauthorized API access and cross-origin writes rejected; real Sandbox Link-token creation verified. The Pages output check needs an actual Jekyll `_site` build and is run by CI; it cannot run locally without that build. `mvp/` and `docs/` are excluded from public Pages. Existing public landing/privacy assets are unchanged.

Start by reviewing the current inbox against Figma and Mendel's iPhone feedback, then implement a focused visual improvement without rewriting the working ledger or expanding the feature scope. Update `docs/project-status.md` with what changed and what was actually tested before handing back.
