import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.mjs';
import { ACCOUNTS, SCENARIOS, allTransactions, customUser, publicTokenRequest } from '../sandbox/banks.mjs';
import { RECEIPTS, CARD_LAST4, subtotalCents } from '../sandbox/receipts.mjs';

const today = '2026-11-03';
const byKey = Object.fromEntries(allTransactions().map(x => [x.key, x]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

test('the custom user config has the shape Plaid expects', () => {
  const config = customUser(today);
  assert.equal(config.override_accounts.length, 3);
  assert.deepEqual(config.override_accounts.map(a => a.subtype), ['checking', 'savings', 'credit card']);
  for (const a of config.override_accounts) {
    assert.ok(['depository', 'credit'].includes(a.type));
    assert.match(a.meta.mask, /^[A-Za-z0-9]{2,4}$/);
    assert.ok(a.transactions.length > 0);
    for (const x of a.transactions) {
      assert.deepEqual(Object.keys(x).sort(), ['amount', 'currency', 'date_posted', 'date_transacted', 'description']);
      assert.match(x.date_transacted, ISO);
      assert.match(x.date_posted, ISO);
      assert.ok(x.date_posted >= x.date_transacted);
      assert.ok(Number.isFinite(x.amount) && x.amount !== 0);
      assert.ok(x.description.length > 0 && x.description.length <= 60);
    }
  }
  // Plaid's documented limits: about 250 transactions and 55 KB per custom user.
  const json = JSON.stringify(config);
  assert.ok(allTransactions().length < 250 && json.length < 55_000);
  assert.equal(new Set(allTransactions().map(x => x.key)).size, allTransactions().length, 'scenario keys are unique');
  assert.equal(publicTokenRequest(today).options.override_username, 'user_custom');
  assert.deepEqual(JSON.parse(publicTokenRequest(today).options.override_password), config);
});

test('dates roll forward with the given today and stay inside the 90-day sync window', () => {
  const a = customUser('2026-11-03'), b = customUser('2027-03-01');
  const first = c => c.override_accounts[0].transactions[0].date_transacted;
  assert.equal(first(a), L.addDays('2026-11-03', allTransactions().find(x => x.account === 'checking').day));
  assert.equal(first(b), L.addDays('2027-03-01', allTransactions().find(x => x.account === 'checking').day));
  for (const x of allTransactions()) assert.ok(x.day <= 0 && x.day > -90, x.key);
});

test('pending charges post in the future; everything else has already posted', () => {
  const pending = allTransactions().filter(x => x.posts != null);
  assert.deepEqual(pending.map(x => x.key).sort(), ['bestBuyPending', 'gasHold', 'restaurantPending']);
  for (const x of pending) assert.ok(L.addDays(today, x.posts) > today, x.key);
  const posted = customUser(today).override_accounts.flatMap(a => a.transactions).filter(x => x.date_posted <= today);
  assert.equal(posted.length, allTransactions().length - pending.length);
  assert.ok(byKey.bestBuyPending.amountCents >= 100000, 'one pending charge is large');
  assert.match(byKey.gasHold.description, /SHELL/);
});

test('every required scenario is in the test bank', () => {
  const has = (key, account, cents) => {
    assert.ok(byKey[key], key);
    if (account) assert.equal(byKey[key].account, account, key);
    if (cents != null) assert.equal(byKey[key].amountCents, cents, key);
  };
  has('kahans1', 'checking', 253); has('kahans2', 'checking', 253);
  assert.equal(byKey.kahans1.description, byKey.kahans2.description);
  // refunds: full and partial (negative = money back)
  assert.equal(byKey.oldNavyRefund.amountCents, -byKey.oldNavy.amountCents);
  assert.ok(byKey.amazonPartialRefund.amountCents < 0 && -byKey.amazonPartialRefund.amountCents < byKey.amazon.amountCents);
  // transfers, each looking like a transfer to the app
  for (const k of ['zelleOut', 'paypal', 'venmoOut', 'venmoIn', 'toSavings', 'fromChecking', 'cardPayment', 'friendPayback']) assert.ok(L.looksLikeTransfer(byKey[k].description), k);
  assert.ok(byKey.zelleOut.amountCents > 0 && byKey.friendPayback.amountCents < 0);
  assert.match(byKey.friendPayback.description, /ZELLE PAYMENT FROM [A-Z]+ [A-Z]+/);
  // own-account transfers appear on both sides with opposite amounts
  assert.equal(byKey.toSavings.amountCents, -byKey.fromChecking.amountCents);
  assert.equal(byKey.fromChecking.account, 'savings');
  assert.equal(byKey.cardPayment.amountCents, -byKey.cardPaymentReceived.amountCents);
  assert.equal(byKey.cardPaymentReceived.account, 'card');
  // subscriptions: monthly, annual, price increase, stopped
  assert.equal(SCENARIOS.subscriptions.filter(x => x.description === 'SPOTIFY USA').length, 3);
  has('primeAnnual', 'card', 13900);
  const netflix = SCENARIOS.subscriptions.filter(x => x.description === 'NETFLIX.COM').sort((a, b) => a.day - b.day);
  assert.ok(netflix.at(-1).amountCents > netflix[0].amountCents);
  const gym = SCENARIOS.subscriptions.filter(x => /PLANET FITNESS/.test(x.description));
  assert.ok(gym.length >= 2 && Math.max(...gym.map(x => x.day)) < -31, 'the gym stopped charging');
  assert.match(byKey.atm.description, /ATM/);
  assert.ok(SCENARIOS.payroll.length >= 4 && SCENARIOS.payroll.every(x => x.amountCents < 0 && x.account === 'checking'));
  has('noReceipt');
  assert.ok(!RECEIPTS.some(r => r.charge === 'noReceipt'));
});

test('every receipt adds up exactly and matches its bank charge', () => {
  for (const r of RECEIPTS) {
    for (const i of r.items) {
      assert.ok(Number.isSafeInteger(i.amountCents) && i.amountCents > 0, i.code);
      if (i.qty) assert.equal(i.qty * i.unitCents, i.amountCents, i.code);
      assert.ok(i.code.length <= 14 && i.code === i.code.toUpperCase(), i.code);
    }
    assert.equal(subtotalCents(r) + r.taxCents, r.totalCents, r.id);
    const charge = byKey[r.charge];
    assert.ok(charge, r.id);
    assert.equal(r.payment.last4, ACCOUNTS[charge.account].meta.mask, r.id);
    assert.ok(r.day === charge.day, r.id);
  }
  const receipt = id => RECEIPTS.find(r => r.id === id);
  assert.deepEqual([receipt('target-split').totalCents, byKey.targetSplit.amountCents], [15000, 15000]);
  assert.deepEqual(new Set(receipt('target-split').items.map(i => i.category)), new Set(['groceries', 'household', 'personal care', 'clothing']));
  assert.deepEqual([receipt('home-depot').totalCents, byKey.homeDepot.amountCents], [15000, 15000]);
  assert.deepEqual([receipt('shoprite-off').totalCents, byKey.shopriteOff.amountCents], [15000, 14500]);
  assert.equal(receipt('best-buy-pending').totalCents, byKey.bestBuyPending.amountCents);
  assert.equal(CARD_LAST4.card, ACCOUNTS.card.meta.mask);
});

// Cases Plaid Sandbox cannot produce from a custom user, covered against the sync rules instead.
const plaid = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'chk', name: 'SHELL OIL 57442', amount, date: today, pending: false, ...extra });
const travel = 'preset-3';

test('a gas-station hold that posts at the real fill-up amount stays one purchase', () => {
  const s = L.newState();
  L.applySync(s, 'bank', { added: [plaid('hold', 100, { pending: true })] });
  L.applySync(s, 'bank', { added: [plaid('fill', 42.18, { pending_transaction_id: 'hold' })], removed: [{ transaction_id: 'hold' }] });
  assert.equal(s.txns.length, 1);
  assert.deepEqual([s.txns[0].amountCents, s.txns[0].pending, s.txns[0].reviewed, s.txns[0].amountChanged], [4218, false, false, false]);

  // Plaid can also change the amount in place (a "modified" update); a reviewed charge then needs review again.
  const s2 = L.newState();
  L.applySync(s2, 'bank', { added: [plaid('hold', 100, { pending: true })] });
  L.confirmTxn(s2, { id: 'hold', categoryId: travel });
  L.applySync(s2, 'bank', { modified: [plaid('hold', 42.18)] });
  assert.deepEqual([s2.txns.length, s2.txns[0].amountCents, s2.txns[0].reviewed, s2.txns[0].amountChanged, s2.txns[0].categoryId], [1, 4218, false, true, travel]);
  assert.equal(L.budgetSummary(s2, today).find(c => c.id === travel).total, 0, 'it stops counting until reviewed again');
});

test('a pending charge that drops off without posting stops counting', () => {
  const s = L.newState();
  L.applySync(s, 'bank', { added: [plaid('auth', 64.2, { pending: true, name: 'OLIVE GARDEN #1782' })] });
  L.confirmTxn(s, { id: 'auth', categoryId: 'preset-2' });
  assert.equal(L.budgetSummary(s, today).find(c => c.id === 'preset-2').pending, 6420);
  L.applySync(s, 'bank', { removed: [{ transaction_id: 'auth' }] });
  assert.equal(s.txns.length, 0);
  assert.equal(L.budgetSummary(s, today).find(c => c.id === 'preset-2').pending, 0);
});

test('the same bank transaction delivered twice is kept once', () => {
  const s = L.newState();
  L.applySync(s, 'bank', { added: [plaid('dup', 2.53, { name: "KAHAN'S" })] });
  L.applySync(s, 'bank', { added: [plaid('dup', 2.53, { name: "KAHAN'S" })] });
  assert.equal(s.txns.length, 1);
});
