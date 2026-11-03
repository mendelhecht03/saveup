# Shared SaveUp instructions

These instructions apply to every coding assistant (Claude Code reads them through `CLAUDE.md`, Codex reads this file directly).

## Work with Mendel

Mendel is an aspiring programmer without a deep understanding of the codebase. Explain concepts clearly and concisely, in plain language. Handle routine implementation without asking repeated permission; ask about product tradeoffs.

## One app, one source of truth

* The only app is `lite/`. Do not create a second app, a parallel copy, or a new top-level app folder. Improve `lite/` instead.
* GitHub `main` is the source of truth. Never commit to `main` directly. Start each task with `git switch main && git pull`, then create a descriptive branch, and open a pull request when done.
* One assistant works in a checkout at a time. If parallel work is explicitly requested, use a separate git worktree on its own branch.
* Run `git status --short --branch` before editing. Never reset, discard, or overwrite uncommitted work you did not create; ask Mendel first.
* Archived work lives on `archive/*` branches (for example `archive/codex-mvp`, the earlier `mvp/` app with real-bank setup). Read them for reference only; copy pieces deliberately, never merge them.
* At handoff, summarize what changed, checks run, branch, and push status. Keep `docs/project-status.md` current. Chat history does not transfer between assistants.

## Product boundaries

* Current scope: Plaid **Sandbox only**, with custom fake data, to simulate edge cases (pending to posted, changed amounts, transfers, refunds, duplicates, hand-logged purchases). Real bank connections (Plaid Production) are out of scope until Mendel says otherwise.
* `docs/product-spec.md` describes the larger future product.
* Preserve the icy-blue Friendly Spatial style: floating white cards, navy type, bright blue pills, soft shadows, dimensional icons, generous touch targets, and mobile-safe spacing.
* Keep review deliberate: a suggestion or category selection alone does not confirm a transaction.
* Keep bank settlement (pending/posted) separate from user review. A changed final amount requires review again; posting must not duplicate a purchase.
* Transfers require an explicit purpose before counting as income or spending. Own-account transfers are neutral.
* Use integer cents. Splits must sum exactly.
* Preserve the public `index.html` and `privacy.html`. GitHub Pages is public even though the repository is private: keep internal files excluded in `_config.yml`, add exclusions for any new top-level internal folder, and never add `.nojekyll`.
* Never commit secrets, `.env` values, bank data, or preview links.

## Development and validation

* Node.js 24 LTS. No dependencies or build step.
* `npm start` serves the app at http://127.0.0.1:4193. `npm run phone` prints a private 8-hour link for Mendel's phone. `npm run check` runs syntax checks and tests. See `lite/README.md` for keys and data location.
* After changing calculations, run the checks and add a regression test for meaningful behavior. For interface changes, check 390px and 320px widths for overflow. Do not claim iPhone testing based only on desktop emulation.
* Before committing, inspect the diff. Never force-push shared history.