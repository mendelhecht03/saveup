import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store, receiptMatches } from '../store.mjs';
import { fixtureBatch } from '../fixtures.mjs';
import { plaidClient } from '../plaid.mjs';
import { createApp } from '../server.mjs';
import { receiptReader, normalizeParse, RECEIPT_MODEL } from '../receipts.mjs';
import { budgetTotals } from '../public/budget-math.js';

const week = { start: '2026-11-01', end: '2026-11-07' };
function sampleStore(t) {
  const store = new Store(':memory:', randomBytes(32)); t.after(() => store.close());
  store.addItem({ id: 'sample-bank', provider: 'fixture', name: 'Sample bank', token: 'fixture-secret' });
  store.applySync('sample-bank', fixtureBatch());
  return store;
}
// Matches the $11.00 Target fixture: 9.99 + 0.31 - 0.20 + 0.90 tax = 11.00.
const target = (more = {}) => ({ merchant: 'Target', date: '2026-11-03', taxCents: 90, tipCents: 0, totalCents: 1100,
  items: [{ name: 'Shampoo', printed: 'UP&UP SHMP', amountCents: 999 }, { name: 'Chocolate bar', amountCents: 31 }, { name: 'Circle discount', amountCents: -20 }], ...more });
const spent = (store, category = 'Essentials') => {
  const state = store.state();
  return budgetTotals(state.transactions, state.budgets, week, state.receipts).categories.find(b => b.name === category);
};

test('receipt lines must add up exactly to the total, in whole cents', t => {
  const store = sampleStore(t);
  assert.throws(() => store.checkReceipt(target({ totalCents: 1101 })), /add up to \$11\.00, but the total is \$11\.01/);
  assert.throws(() => store.checkReceipt(target({ items: [{ name: 'Shampoo', amountCents: 9.5 }] })), /whole cents/);
  assert.throws(() => store.checkReceipt(target({ date: '' })), /date/);
  assert.throws(() => store.checkReceipt(target({ imageId: 'missing' })), /expired/);
  assert.equal(store.checkReceipt(target()).totalCents, 1100);
});

test('a watched receipt counts as unverified, matching it counts the purchase once, and it cannot be matched twice', t => {
  const store = sampleStore(t);
  const id = store.saveReceipt({ receipt: target(), category: 'Essentials', description: 'Shampoo and a treat', watch: true });
  let essentials = spent(store);
  assert.deepEqual([essentials.unverified, essentials.spent], [1100, 1100]);
  const receipt = store.state().receipts.find(r => r.id === id);
  const charge = store.state().transactions.find(t => t.externalId === 'demo-target');
  assert.equal(receipt.matches[0].transactionId, charge.id); assert.equal(receipt.matches[0].exact, true);
  // Kahan's (2.53) must not appear: wrong amount and wrong name.
  assert.equal(receipt.matches.length, 1);
  store.review(charge.id, { revision: charge.revision, category: 'Essentials', description: 'Shampoo', note: '', receipt: { ...target(), id } });
  const state = store.state();
  assert.equal(state.receipts.find(r => r.id === id).status, 'linked');
  assert.equal(state.transactions.find(t => t.id === charge.id).receiptId, id);
  essentials = spent(store);
  assert.deepEqual([essentials.unverified, essentials.posted, essentials.spent], [0, 1100, 1100]);
  const kahan = state.transactions.find(t => t.externalId === 'demo-kahan');
  assert.throws(() => store.review(kahan.id, { revision: kahan.revision, category: 'Essentials', description: '', note: '', receipt: { ...target(), id } }), /another purchase/);
  assert.throws(() => store.removeReceipt(id), /reviewed purchase/);
});

test('cash receipts count as settled spending and can be removed; receipts attach only to purchases', t => {
  const store = sampleStore(t);
  const id = store.saveReceipt({ receipt: target({ merchant: 'Farmers market', totalCents: 1100 }), category: 'Essentials', watch: false });
  assert.equal(store.state().receipts.find(r => r.id === id).matches.length, 0);
  assert.deepEqual([spent(store).posted, spent(store).unverified], [1100, 0]);
  assert.throws(() => store.saveReceipt({ receipt: target(), category: 'Not a budget', watch: true }), /category/);
  store.removeReceipt(id); assert.equal(spent(store).spent, 0);
  const zelle = store.state().transactions.find(t => t.externalId === 'demo-zelle');
  assert.throws(() => store.review(zelle.id, { revision: zelle.revision, classification: 'income', description: '', note: '', receipt: target() }), /purchases only/);
});

test('a re-posted amount still reopens review and keeps the attached receipt', t => {
  const store = sampleStore(t);
  const pending = store.state().transactions.find(t => t.externalId === 'demo-groceries-pending');
  const receipt = { merchant: 'Freshmart', date: '2026-11-04', items: [{ name: 'Groceries', amountCents: 3000 }], taxCents: 0, tipCents: 0, totalCents: 3000 };
  store.review(pending.id, { revision: pending.revision, category: 'Essentials', description: 'Groceries', note: '', receipt, merchant: 'Freshmart' });
  store.applySync('sample-bank', fixtureBatch(true));
  const posted = store.state().transactions.find(t => t.externalId === 'demo-groceries-posted');
  assert.equal(posted.reviewed, false); assert.ok(posted.receiptId);
  assert.equal(store.state().receipts.length, 1);
});

test('matching accepts a close total only from a similar merchant, within the posting window', () => {
  const charge = { id: 'a', kind: 'purchase', direction: 'out', currency: 'USD', name: 'CORNER CAFE #12', date: '2026-11-02', amount: 660, status: 'posted' };
  const receipt = { merchant: 'Corner Café', date: '2026-11-01', totalCents: 550 };
  assert.equal(receiptMatches(receipt, [charge])[0].difference, 110);
  assert.equal(receiptMatches(receipt, [{ ...charge, name: 'Gas station' }]).length, 0);
  assert.equal(receiptMatches(receipt, [{ ...charge, date: '2026-11-20' }]).length, 0);
  assert.equal(receiptMatches(receipt, [charge], new Set(['a'])).length, 0);
});

test('the reader sends the photo to Claude with a JSON schema and keeps only well-formed fields', async () => {
  let sent;
  const answer = { is_receipt: true, merchant: 'Target', date: '2026-11-03', items: [{ name: 'Shampoo', printed: 'UP&UP SHMP', amount_cents: 999 }, { name: 'Gum\u0007', printed: '', amount_cents: 1.5 }], tax_cents: 90, tip_cents: 0, total_cents: 1100, notes: '' };
  const reader = receiptReader({ apiKey: 'test-key', fetchImpl: async (url, options) => {
    sent = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(answer) }] }));
  } });
  const parsed = await reader.read('aGVsbG8=', 'image/jpeg');
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.options.headers['x-api-key'], 'test-key');
  assert.equal(sent.body.model, RECEIPT_MODEL);
  assert.equal(sent.body.output_config.format.type, 'json_schema');
  assert.equal(sent.body.messages[0].content[0].source.data, 'aGVsbG8=');
  assert.deepEqual(parsed.items.map(i => [i.name, i.amountCents]), [['Shampoo', 999], ['Gum', 0]]);
  await assert.rejects(reader.read('aGVsbG8=', 'image/gif'), /JPEG/);
  await assert.rejects(receiptReader({}).read('aGVsbG8=', 'image/jpeg'), /ANTHROPIC_API_KEY/);
  const refusing = receiptReader({ apiKey: 'k', fetchImpl: async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] })) });
  await assert.rejects(refusing.read('aGVsbG8=', 'image/jpeg'), /declined/);
  assert.throws(() => normalizeParse({ is_receipt: false }), /does not look like a receipt/);
});

test('HTTP scan stores the photo encrypted, reports the matching inbox charge, and serves the photo back locally', async t => {
  const store = sampleStore(t);
  const reader = { configured: true, read: async () => normalizeParse({ is_receipt: true, merchant: 'Target', date: '2026-11-03', tax_cents: 90, tip_cents: 0, total_cents: 1100, notes: '',
    items: [{ name: 'Shampoo', printed: '', amount_cents: 1010 }] }) };
  const { server } = createApp({ store, client: plaidClient({}), reader });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(base + '/api/state')).json();
  assert.equal(state.receiptsConfigured, true);
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': state.csrfToken }, body: JSON.stringify(body) });
  const photo = Buffer.from('not really a jpeg').toString('base64');
  const response = await post('/api/receipts/scan', { image: photo, mediaType: 'image/jpeg' });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.duplicates.transactions[0].name, 'Target');
  assert.ok(!store.db.prepare('SELECT data FROM receipt_images').get().data.includes(photo));
  const image = await fetch(`${base}/api/receipts/image?id=${result.imageId}`);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(Buffer.from(await image.arrayBuffer()).toString(), 'not really a jpeg');
  assert.equal((await post('/api/receipts/scan', { image: 'bad data!', mediaType: 'image/jpeg' })).status, 400);
  assert.equal((await post('/api/review', { id: 'x', padding: 'a'.repeat(40000) })).status, 413);
  const saved = await post('/api/receipts/save', { receipt: { ...result.parsed, imageId: result.imageId }, category: 'Essentials', description: '', watch: true });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).receipts[0].status, 'watching');
});
