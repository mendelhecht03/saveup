// Sample receipts that match charges in the test bank (see banks.mjs). Milestone 5
// renders receipt images from this data, so it reads like real paper: short printed
// item codes, line totals in integer cents, tax, total and the card's last 4.
// `day` is days relative to today (negative = past); `charge` names the bank
// transaction in banks.mjs that the receipt should match.

export const CARD_LAST4 = { checking: '0721', card: '4417' };

const line = (code, name, amountCents, category, qty, unitCents) => (qty ? { code, name, qty, unitCents, amountCents, category } : { code, name, amountCents, category });

export const RECEIPTS = [
  {
    // One trip, four budgets: the split-across-budgets case.
    id: 'target-split', charge: 'targetSplit', merchant: 'Target', store: 'Target T-1847 · 410 Route 17 N, Paramus NJ',
    day: -4, time: '14:32', payment: { method: 'card', last4: CARD_LAST4.card },
    items: [
      line('GV WHL MLK', 'Good & Gather whole milk, gallon', 429, 'groceries'),
      line('GG LG EGGS 18', 'Good & Gather large eggs, 18 ct', 549, 'groceries'),
      line('BANANAS', 'Bananas', 173, 'groceries'),
      line('GG SRDGH BRD', 'Good & Gather sourdough bread', 499, 'groceries'),
      line('GG BBY SPNCH', 'Good & Gather baby spinach', 399, 'groceries'),
      line('CHOB GRK YGT', 'Chobani Greek yogurt 4 pk', 649, 'groceries'),
      line('TIDE PODS 42', 'Tide Pods, 42 ct', 1399, 'household'),
      line('BOUNTY 6 RL', 'Bounty paper towels, 6 rolls', 1949, 'household'),
      line('UP&UP TRSH BG', 'up&up trash bags', 999, 'household'),
      line('CRST 3D WHT', 'Crest 3D White toothpaste', 699, 'personal care'),
      line('DOVE BDY WSH', 'Dove body wash', 899, 'personal care'),
      line('UP&UP CTN RND', 'up&up cotton rounds', 279, 'personal care'),
      line('AND TEE', 'A New Day T-shirt', 1200, 'clothing'),
      line('GDFLW SOCK 6P', 'Goodfellow socks, 6 pairs', 1500, 'clothing'),
      line('AIM LEGGING', 'All in Motion leggings', 2500, 'clothing')
    ],
    taxCents: 878, totalCents: 15000
  },
  {
    id: 'home-depot', charge: 'homeDepot', merchant: 'The Home Depot', store: 'The Home Depot #0912 · 1 Industrial Ave, Hackensack NJ',
    day: -11, time: '09:05', payment: { method: 'card', last4: CARD_LAST4.card },
    items: [
      line('2X4-8 PRM STD', '2 in. x 4 in. x 8 ft. prime stud', 2388, 'housing', 6, 398),
      line('BEHR PP 1G', 'Behr Premium Plus interior paint, 1 gal', 6996, 'housing', 2, 3498),
      line('PURDY 2.5 BR', 'Purdy 2.5 in. angled brush', 1599, 'housing'),
      line('9IN RLR KIT', '9 in. roller kit', 1297, 'housing'),
      line('SCTCH BLU TP', 'ScotchBlue painter’s tape 1.88 in.', 697, 'housing'),
      line('DRYWL SCRW 1L', 'Drywall screws, 1 lb', 897, 'housing')
    ],
    taxCents: 1126, totalCents: 15000
  },
  {
    // The bank charged $145.00 for this $150.00 receipt, so matching must show the
    // $5.00 difference and never link it automatically.
    id: 'shoprite-off', charge: 'shopriteOff', merchant: 'ShopRite', store: 'ShopRite of Teaneck · 1600 Queen Anne Rd, Teaneck NJ',
    day: -3, time: '18:47', payment: { method: 'card', last4: CARD_LAST4.checking },
    items: [
      line('SR WHL MLK GL', 'ShopRite whole milk, gallon', 389, 'groceries'),
      line('SR LG EGGS 18', 'ShopRite large eggs, 18 ct', 549, 'groceries'),
      line('PRDU CKN BRST', 'Perdue chicken breast', 1689, 'groceries'),
      line('GRND BF 80/20', 'Ground beef 80/20', 1298, 'groceries'),
      line('ATL SLMN FLT', 'Atlantic salmon fillet', 1549, 'groceries'),
      line('BNLS RIBEYE', 'Boneless ribeye steak', 1553, 'groceries'),
      line('SR PENNE 16Z', 'ShopRite penne, 16 oz', 258, 'groceries', 2, 129),
      line('RAOS MRNRA', 'Rao’s marinara sauce', 899, 'groceries'),
      line('HASS AVCDO', 'Hass avocados', 500, 'groceries', 4, 125),
      line('STRWBRY 1LB', 'Strawberries, 1 lb', 399, 'groceries'),
      line('ROMAINE HRT', 'Romaine hearts', 349, 'groceries'),
      line('CHRIOS FAM', 'Cheerios family size', 629, 'groceries'),
      line('TROP OJ 52Z', 'Tropicana orange juice, 52 oz', 479, 'groceries'),
      line('BRYR VAN ICR', 'Breyers vanilla ice cream', 599, 'groceries'),
      line('SR SHR MOZ 2L', 'ShopRite shredded mozzarella, 2 lb', 899, 'groceries'),
      line('CHOB 4PK', 'Chobani 4 pk', 1098, 'groceries', 2, 549),
      line('SR PPR TWL 6', 'ShopRite paper towels, 6 rolls', 1199, 'household'),
      line('DAWN DSH 38Z', 'Dawn dish soap, 38 oz', 549, 'household')
    ],
    taxCents: 116, totalCents: 15000
  },
  {
    // Matches the large charge that is still pending at the bank.
    id: 'best-buy-pending', charge: 'bestBuyPending', merchant: 'Best Buy', store: 'Best Buy #1062 · 255 Route 4 W, Paramus NJ',
    day: -1, time: '19:12', payment: { method: 'card', last4: CARD_LAST4.card },
    items: [
      line('LEN IDPD5 16', 'Lenovo IdeaPad 5 16 in. laptop', 89999, 'education'),
      line('SNDSK 1TB SSD', 'SanDisk 1TB portable SSD', 7999, 'education'),
      line('GS PROT 2YR', 'Geek Squad Protection, 2 years', 14999, 'education')
    ],
    taxCents: 7486, totalCents: 120483
  }
];

export const subtotalCents = r => r.items.reduce((s, i) => s + i.amountCents, 0);
