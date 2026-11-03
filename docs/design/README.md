# Design reference

Mockups Mendel had generated in late October 2026. They are the **visual and behavioral target** for SaveUp. Match their look and their rules; they are reference images, not pixel-perfect specs. The mockups call the app "Budget"; the app's name is SaveUp.

* `style-friendly-spatial.png`: the chosen visual style (icy blue background, white rounded cards, navy type, blue pill buttons, soft pastel icons).
* `walkthrough/01` to `09`: each image shows three phone screens for one flow. `walkthrough/screen-notes.txt` describes every screen in exact detail, including the product rules. Read it alongside the images.

| Board | Flow | In current scope? |
| --- | --- | --- |
| 01-setup | Connect a bank, pick budgets, create a budget | Yes |
| 02-budgets-home | Budgets at a glance, what the bar means, purchases per budget | Yes |
| 03-weekly-inbox | Weekly inbox, confirm familiar suggestions, explain an uncertain purchase | Yes |
| 04-receipt-review | Attach a receipt, check the scan, split across budgets | Later |
| 05-manual-and-matching | Cash purchase, card receipt before the bank, match without duplicates | Yes |
| 06-transfers | Give transfers a purpose; own-account transfers are neutral | Yes |
| 07-plans-affordability | Planned purchases and "what if it costs..." | Yes |
| 08-goals-purchase | Put unused budget toward a goal, then the real purchase | Later |
| 09-ongoing-use | Finish the week, subscriptions, settings | Partly (finish the week, settings) |

Key rules from the notes: bank status (Pending/Posted), review status (Needs review/Reviewed) and receipt matching (Awaiting bank match/Matched) are three separate things; budget room set aside is not spending; never count anything twice; a store and price never prove what was bought; percentages go past 100%.

Other style explorations (paper and clay, editorial, night mode, and so on) were not chosen and are not kept here.
## The style in words

Use this with the images. When an image and this list disagree, the image wins.

* **Background:** almost-white icy blue (about `#EDF6FF`). Content sits on white cards with large rounded corners (about 20 to 24px) and soft, blue-gray shadows. No hard borders.
* **Type:** a rounded, friendly sans-serif. Navy (not black) for text. Big bold page titles ("Inbox"), bold amounts aligned to the right, gray-blue for secondary lines like "Oct 26 · Posted".
* **Primary button:** vivid blue, full-width pill with white bold text ("Confirm & next", "Plan a purchase", "Add purchase"). Secondary button: pale fill or thin outline, blue or navy text.
* **Icons:** two kinds. Budget categories get small 3D, clay-like pastel illustrations (game controller, guitar, lotion bottle) on a soft rounded tile. Merchants and list rows get simple colored glyphs in a pale circle or rounded square.
* **Status pills:** small, rounded, soft-tinted with darker text. Posted and Reviewed are mint green; Pending, Needs purpose and warnings are amber or peach; Needs review and Category unknown are pale gray-blue. Bank status and review status are always separate pills.
* **Category chips:** pastel tint per category (Groceries green, Recreation mint, Education lavender, Personal Care pink).
* **Budget bar:** a thick rounded bar split into segments: spent is solid blue, pending is amber with a dotted texture, planned is green with diagonal stripes, what's left is pale gray. Under it, a legend with a colored dot, the percent, the dollar amount and the label. Percentages go past 100%.
* **Budget detail:** a big bold number for what's left ("$60 left after plans") with the limit in a small white card beside it.
* **Lists:** grouped into cards with a header row (icon, bold title, short gray subtitle, chevron), then rows separated by thin dividers, with a "Show all" link at the bottom.
* **Choices:** selectable options are full-width rows with a radio button and icon; the selected one gets a blue outline. Sliders have readable labels at each stop (Low, Normal, High, Essential).
* **Navigation:** bottom bar with Inbox, Budgets, Planned, More. The active tab is blue. Detail screens use a blue "< Back" link at top left.
* **Copy:** short and plain ("12 to review this week", "Pending spending already reduces what is left"). Exact amounts. No slogans, no big decorative hero graphics.