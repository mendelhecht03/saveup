# Shared SaveUp instructions

## Work with Mendel

Mendel is an aspiring programmer and doesn't have a deep understand of how the codebase works. Explain concepts clearly yet concisely. If something is complicated assume that Mendel

## Start here

* Read `README.md` and `docs/project-status.md`; consult `docs/product-spec.md` for the larger vision.
* For the current MVP/Figma handoff, read `docs/claude-handoff.md`. Active app code is `mvp/`; `prototype/` is the earlier mock-data app. Continue on `feature/plaid-sandbox` for this handoff.
* This GitHub repository is the shared source for future work. The earlier Sites checkout is an archived starting point, not a second place to develop the app.
* Run `git status --short --branch` before editing. Preserve existing work; never reset, discard, or overwrite another assistant's changes.
* Mendel alternates Codex and Claude Code in this same local folder. Reuse the current task branch when continuing a handoff. Do not run concurrent editors against the same checkout. If parallel work is explicitly requested, use separate branches and worktrees or clones.
* At handoff, summarize what changed, checks run, current branch, commit/push status, and any unfinished work. Keep `docs/project-status.md` current when scope or behavior changes. Chat history does not transfer between assistants.

## Product boundaries

* Current MVP scope is Plaid Sandbox integration, the basic review inbox, and weekly category budgeting only. Use Figma as visual reference for those features; do not implement the whole file. Receipt scanning, splits/IOUs, plans, subscriptions, AI/guide screens, and other advanced features are deferred unless Mendel explicitly expands scope.
* Preserve the icy-blue Friendly Spatial style: floating white cards, navy type, bright blue pills, soft shadows, dimensional icons, generous touch targets, and mobile-safe spacing.
* Keep review deliberate: a suggestion or category selection alone does not confirm a transaction.
* Keep bank settlement (pending/posted) separate from user review. A changed final amount requires review again; posting must not duplicate a purchase.
* Transfers require explicit purpose and valid direction before counting as income or spending. Own-account transfers are neutral.
* Use integer cents. Splits must sum exactly; IOUs are separate from personal spending while preserving the original outflow. Planned matches release their reservation once without duplicating the expense.
* Preserve the existing public `index.html` and `privacy.html` unless the task specifically concerns them.
* GitHub Pages is public, even though the repository is private. Keep internal files excluded by `\_config.yml`; add exclusions for any new top-level internal directory or document. Do not add `.nojekyll`, which would bypass those exclusions.
* Never commit secrets, `.env` values, real receipts, bank exports, or deployment credentials. Keep the font license with the fonts.

## Development and validation

* Use Node.js 24 LTS. No dependencies or build step are required. `prototype/dist/` is editable source.
* `npm start` serves the app at http://127.0.0.1:4187; `npm run check` checks syntax and runs the ledger tests.
* After changes to calculations, run the checks and add a regression test when it protects meaningful behavior. For interface changes, also inspect affected flows at 390px and 320px widths and check for horizontal overflow. Do not claim iPhone Safari testing based only on desktop emulation.
* Before committing, inspect the diff and confirm the public pages and deployment exclusions remain correct. Commit and push when requested; never force-push shared history. For a new task, prefer a descriptive branch; merge completed work only within the user's requested scope.
* A GitHub push does not deploy the separate Sites preview. Follow `docs/deployment.md` and report accurately whether a preview was updated.
