# SaveUp

A personal budgeting app: a weekly inbox where you reconcile every purchase, budgets that show pending money honestly, and transfers that never count until you say what they are.

The app lives in `lite/` and uses **Plaid Sandbox** (fake banks and custom fake transactions) for testing.

## Use it

1. Put Plaid Sandbox keys in `lite/.env.local` (never committed). See `lite/README.md`.
2. `npm start` runs the app at http://127.0.0.1:4193.
3. `npm run phone` prints a private link to open it on your phone (expires after 8 hours; keep the app running).
4. `npm run check` runs the tests.

## How work happens here

`main` on GitHub is the one true version. Every change, from Claude Code or Codex, happens on its own branch and arrives through a pull request. Rules for coding assistants are in `AGENTS.md`. Older experiments are kept on `archive/*` branches.