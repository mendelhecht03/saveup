import test from 'node:test';
import assert from 'node:assert/strict';
import { veryfiReceiptReader, fromVeryfi } from '../receipts/veryfi.mjs';
import { pickReceiptReader } from '../server.mjs';

const budgets = [{ id: 'g', name: 'Groceries', description: 'Food' }, { id: 'h', name: 'Household', description: 'Cleaning' }];

// Shaped like a real Veryfi answer for part of the Target sample receipt.
const answer = {
  vendor: { name: 'Target' },
  date: '2026-10-30 14:32:00',
  payment: { card_number: '4417', type: 'visa' },
  subtotal: 22.17, tax: 1.38, total: 23.55,
  line_items: [
    { description: 'GV WHL MLK', full_description: 'Good & Gather Whole Milk', total: 4.29, category: 'Groceries', type: 'food' },
    { description: 'TIDE PODS 42', total: 13.99, category: 'Household', type: 'product' },
    { description: 'AND TEE', total: 12.0, category: 'Apparel', type: 'product' },
    { description: 'COUPON', total: -8.11, type: 'discount' },
    { description: 'Sales tax', total: 1.38, type: 'tax' }
  ]
};

test('a Veryfi answer becomes the same reading Claude would give', () => {
  const r = fromVeryfi(answer, budgets);
  assert.deepEqual([r.merchant, r.date, r.time, r.last4, r.method, r.taxCents, r.totalCents], ['Target', '2026-10-30', '14:32', '4417', 'card', 138, 2355]);
  assert.deepEqual(r.lines.map(l => [l.code, l.amountCents, l.categoryId, l.unsure]), [
    ['GV WHL MLK', 429, 'g', false],
    ['TIDE PODS 42', 1399, 'h', false],
    ['AND TEE', 1200, '', true],
    ['COUPON', -811, '', true]
  ], 'tax is not an item; a discount stays as a negative line; an unknown budget is left for the person');
  assert.equal(r.lines[0].name, 'Good & Gather Whole Milk');
});

test('Veryfi fields given as { value, score } are read too', () => {
  const r = fromVeryfi({ vendor: { name: { value: 'ShopRite', score: 0.9 } }, total: { value: 5, score: 1 }, tax: { value: 0 }, line_items: [{ description: { value: 'MILK' }, total: { value: 5 } }] }, budgets);
  assert.deepEqual([r.merchant, r.totalCents, r.lines[0].code, r.lines[0].amountCents], ['ShopRite', 500, 'MILK', 500]);
});

test('the Veryfi request sends the photo, the budget names and the keys', async () => {
  let call;
  const reader = veryfiReceiptReader({ clientId: 'cid', apiKey: 'key', fetchImpl: async (url, init) => { call = { url, init }; return { ok: true, json: async () => answer }; } });
  await reader.read({ imageBase64: 'AAAA', mediaType: 'image/jpeg', categories: budgets });
  assert.equal(call.url, 'https://api.veryfi.com/api/v8/partner/documents');
  assert.equal(call.init.headers['CLIENT-ID'], 'cid');
  assert.equal(call.init.headers.authorization, 'Bearer key');
  const body = JSON.parse(call.init.body);
  assert.deepEqual([body.file_data, body.file_name, body.categories], ['AAAA', 'receipt.jpg', ['Groceries', 'Household']]);

  const legacy = veryfiReceiptReader({ clientId: 'cid', apiKey: 'key', username: 'me', fetchImpl: async (u, init) => { call = init; return { ok: true, json: async () => answer }; } });
  await legacy.read({ imageBase64: 'AAAA', mediaType: 'image/png', categories: [] });
  assert.equal(call.headers.authorization, 'apikey me:key');

  const failing = veryfiReceiptReader({ clientId: 'cid', apiKey: 'bad', fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Not Authorized' }) }) });
  await assert.rejects(failing.read({ imageBase64: 'A', mediaType: 'image/png' }), /Veryfi 401: Not Authorized/);
  assert.equal(veryfiReceiptReader({ clientId: 'cid' }), null, 'no key means no Veryfi');
});

test('Veryfi is used when its keys are set, and either reader can be forced', () => {
  const both = { VERYFI_CLIENT_ID: 'c', VERYFI_API_KEY: 'k', ANTHROPIC_API_KEY: 'a' };
  assert.equal(pickReceiptReader(both).readerName, 'Veryfi');
  assert.equal(pickReceiptReader({ ...both, SAVEUP_RECEIPT_READER: 'claude' }).readerName, 'Claude');
  assert.equal(pickReceiptReader({ ANTHROPIC_API_KEY: 'a' }).readerName, 'Claude');
  assert.equal(pickReceiptReader({ ANTHROPIC_API_KEY: 'a', SAVEUP_RECEIPT_READER: 'veryfi' }).readReceipt, null, 'asking for Veryfi without its keys reads nothing rather than silently using Claude');
  assert.equal(pickReceiptReader({}).readReceipt, null);
});
