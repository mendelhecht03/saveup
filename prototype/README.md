# SaveUp Inbox Lab — temporary prototype

A separate, mobile-first UX experiment using fictional data. It does not replace the public SaveUp landing page, privacy page, or the earlier Friendly Spatial budget prototype.

## Open on iPhone

Open https://saveup-inbox-lab-mendel.mendelhecht770.chatgpt.site in Safari. The Site is owner-private; sign in with the same ChatGPT account if prompted. Optional: Safari Share → Add to Home Screen. It is a browser prototype, not an offline app.

**Focused Inbox is the only mode.** The mode switcher, comparison controls, Cards view, and Grouped view have been removed. Old comparison links open Focused Inbox and are normalized to the ordinary Site URL. Existing Focused review progress is preserved.

Choose a category directly in a transaction card, then tap **Review** to confirm. Selecting a category alone does not reconcile the transaction. Tap **Details, splits & IOUs** (or the transaction heading) to expand review controls in the list. Split item amounts must add up exactly; each item can have its own budget or named IOU. Unsaved edits survive collapsing and reopening a row during the current visit. The weekly reconciliation bar stays visible as you scroll and updates after confirmed reviews, independently of bank settlement.

The information button offers a reset for the inbox, a shareable inbox URL, and local feedback notes that can be copied into the chat.

Suggested walkthrough:

1. Choose Kahan’s category in its card and tap Review. Expand its details to add a description such as toothbrush.
2. Review Trader Joe’s while it is pending. Reopen it from Reviewed and simulate it posting. A changed final amount requires review again.
3. Explicitly classify the Zelle or savings transfer. Bank settlement does not decide financial purpose.
4. Expand Target in the list, split its receipt, and assign the chocolate bar to Jamie. See the $4.49 IOU in the IOUs tab.
5. Confirm UNIQLO as the winter-coat plan. Its $125 reservation is released; the $119.90 expense remains once.
6. Visit My week for progress, posted/pending totals, and budget percentages including overages.

## Scope and assumptions

- All interactions run locally. No Plaid credentials, live banks, backend database, analytics, payment APIs, or messages to friends.
- Scan receipt deliberately opens a sample receipt; real camera capture and OCR are not implemented.
- Manual entry is scoped to user-confirmed cash. Bank/receipt verification for manually entered card purchases is outside this prototype.
- Transfer choices are deliberately bounded: own accounts; incoming income; outgoing expense. Other purposes can be left unresolved. IOU repayments and refunds are not implemented.
- Unreviewed activity stays outside budget totals, with an explicit incompleteness notice. Reviewed pending purchases count provisionally.
- The weekly mock budget is $500. Planned reservations use the midpoint estimate. Both before-plan and after-plan remaining amounts are shown.
- IOU portions are separated from personal budget spending, with the original charge preserved. The IOU view is a local record, not a payment request.
- The inbox uses the fixed October 25–31, 2026 sample week, beginning Sunday. The date window can be changed.
- This temporary Site remains available until removed or unpublished; no automatic expiry has been configured.

## Development

Use Node.js 24 LTS, with no package installation. These commands work from this folder or the repository root.

```text
npm start
npm run check
```

Local address: http://127.0.0.1:4187. Only the `dist/` directory is served. `dist/model.js` contains the small ledger model; `dist/app.js` renders the screens and handles actions; `dist/style.css` holds the visual design. Monetary amounts are integer cents.

This prototype now lives in `mendelhecht03/saveup` under `prototype/`. The existing public `index.html` and `privacy.html` remain at the repository root. Hosting metadata and credentials were not imported. The existing Sites preview is a separate snapshot and does not automatically update on GitHub pushes; see [deployment notes](../docs/deployment.md).

Design and behavior references: the user's [original specification](../docs/product-spec.md), the earlier workspace's SaveUp brief/decision log, the linked Main Chat preview, and the existing Friendly Spatial prototype. Nunito Sans files and their license were reused locally from that prototype. See [current project status](../docs/project-status.md) for the latest scope.

## Verification

Ten model tests cover review gating, transfer neutrality/direction, integer-cent splits, IOUs, pending replacement and changed-amount review, planned matching, mock-state isolation, date filtering, and budget overages.

Browser walkthrough in Chromium at a 390×844 mobile viewport covered categorization, blocked unclassified transfers, receipt split errors, IOUs, plan matching, pending-to-posted, all-reviewed completion, correct weekly amounts, manual cash entry, and saved state. Layout checks at 320px confirmed no horizontal overflow for the inbox and receipt dialog. Actual iPhone Safari hardware has not been tested.

The Design A update also verified: default routing despite an older saved Cards preference; preserved existing review data; inline categorization requiring explicit confirmation; details expanding without a modal; IOU drafts surviving collapse and neighboring transaction reviews; adding/removing split lines; exact-sum validation; 100% reconciliation while bank settlement remains pending; and category edits not counting the same transaction twice. Expanded receipt controls fit both 320px and 390px widths. The later focus-only update removed the alternate modes and comparison routes; old links retain the Focused review data.
