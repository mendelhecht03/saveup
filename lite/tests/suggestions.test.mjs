import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.mjs';
import { addAiSuggestions, claudeSuggester } from '../ai.mjs';
import { createApp } from '../server.mjs';
import { sqliteStore } from '../db.mjs';

const plaidTxn = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'a1', name: 'Kahans', amount, date: '2026-11-03', pending: false, ...extra });
const withTxns = (...txns) => { const s = L.newState(); L.applySync(s, 'item1', { added: txns }); return s; };
const groceries = 'preset-1', recreation = 'preset-2';

// A stand-in for Claude that records what it was asked.
const fakeAi = answer => {
  const calls = [];
  const fn = async (txns, categories) => { calls.push({ txns: txns.map(t => t.id), categories: categories.map(c => c.id) }); return txns.map(t => ({ id: t.id, ...answer(t) })); };
  fn.calls = calls;
  return fn;
};

test('AI suggests a budget only for purchases history cannot, and asks once per merchant', async () => {
  const s = withTxns(plaidTxn('k1', 2.53, { date: '2026-10-20' }), plaidTxn('c1', 12, { name: 'Cava' }), plaidTxn('c2', 15, { name: 'Cava' }), plaidTxn('k2', 2.53));
  L.confirmTxn(s, { id: 'k1', categoryId: groceries });
  const ai = fakeAi(() => ({ categoryId: recreation, transferKind: '', reason: 'Cava is a restaurant' }));
  assert.equal(await addAiSuggestions(s, ai), 2);
  assert.deepEqual(ai.calls[0].txns, ['c1'], 'Kahans already has a history suggestion; the two Cava lines share one question');
  const cava = s.txns.find(t => t.id === 'c2');
  assert.deepEqual(L.suggest(s, cava), { categoryId: recreation, transferKind: null, source: 'ai', reason: 'Cava is a restaurant' });
  assert.equal(L.suggest(s, s.txns.find(t => t.id === 'k2')).source, 'history');
  await addAiSuggestions(s, ai);
  assert.equal(ai.calls.length, 1, 'purchases that were asked about are not asked again');
});

test('an AI suggestion never confirms or counts by itself', async () => {
  const s = withTxns(plaidTxn('c1', 12, { name: 'Cava' }));
  await addAiSuggestions(s, fakeAi(() => ({ categoryId: recreation, transferKind: '', reason: 'Restaurant' })));
  const t = s.txns[0];
  assert.equal(t.reviewed, false);
  assert.equal(t.categoryId, null, 'the guess is kept apart from the final category');
  assert.equal(L.budgetSummary(s, '2026-11-04').find(c => c.id === recreation).total, 0);
  L.confirmTxn(s, { id: 'c1', categoryId: recreation });
  assert.equal(t.categoryId, recreation);
  assert.equal(t.suggestionTaken, 'ai');
  assert.equal(L.budgetSummary(s, '2026-11-04').find(c => c.id === recreation).total, 1200);
});

test('choosing a different budget than suggested is recorded as not taken', async () => {
  const s = withTxns(plaidTxn('c1', 12, { name: 'Cava' }));
  await addAiSuggestions(s, fakeAi(() => ({ categoryId: recreation, transferKind: '', reason: 'Restaurant' })));
  L.confirmTxn(s, { id: 'c1', categoryId: groceries });
  assert.equal(s.txns[0].suggestionTaken, null);
});

test('AI suggestions that do not fit are ignored', () => {
  const s = withTxns(plaidTxn('z1', -40, { name: 'Zelle from David' }), plaidTxn('z2', 40, { name: 'Zelle to Josh' }), plaidTxn('r1', -12, { name: 'Cava' }), plaidTxn('x1', 9, { name: 'Shop' }));
  const set = (id, ai) => { s.txns.find(t => t.id === id).ai = ai; return L.suggest(s, s.txns.find(t => t.id === id)); };
  assert.equal(set('z2', { transferKind: 'income' }), null, 'money that left cannot be income');
  assert.equal(set('z1', { transferKind: 'spending', categoryId: groceries }), null, 'money that came in cannot be spending');
  assert.equal(set('z2', { transferKind: 'spending', categoryId: null }), null, 'spending needs a budget');
  assert.equal(set('r1', { categoryId: groceries }), null, 'a refund is not given a budget');
  assert.equal(set('x1', { categoryId: 'deleted-budget' }), null, 'a deleted budget is never suggested');
  assert.equal(set('x1', { categoryId: null, transferKind: null }), null, 'an unsure answer is no suggestion');
  assert.equal(set('z1', { transferKind: 'income' }).transferKind, 'income');
  assert.deepEqual(set('z2', { transferKind: 'spending', categoryId: recreation }), { categoryId: recreation, transferKind: 'spending', source: 'ai', reason: '' });
});

test('card payments on both sides are transfers, so they never count as income or spending', () => {
  const s = withTxns(
    plaidTxn('out', 640, { name: 'CREDIT CARD AUTOPAY', personal_finance_category: { primary: 'LOAN_PAYMENTS' } }),
    plaidTxn('in', -640, { name: 'PAYMENT RECEIVED - THANK YOU', personal_finance_category: { primary: 'LOAN_PAYMENTS' } }),
    plaidTxn('in2', -640, { name: 'PAYMENT RECEIVED - THANK YOU' })
  );
  assert.ok(s.txns.every(t => t.transfer));
});

test('the Claude request asks for JSON matching the budgets, and a failure stays out of the way', async () => {
  let sent;
  const ok = claudeSuggester({ apiKey: 'test-key', fetchImpl: async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ suggestions: [{ id: 'c1', categoryId: recreation, transferKind: '', reason: 'Restaurant' }] }) }] }) };
  } });
  const s = withTxns(plaidTxn('c1', 12, { name: 'Cava' }));
  await addAiSuggestions(s, ok);
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.equal(sent.output_config.format.type, 'json_schema');
  assert.deepEqual(sent.output_config.format.schema.properties.suggestions.items.properties.categoryId.enum, ['', ...s.categories.map(c => c.id)]);
  assert.equal(JSON.parse(sent.messages[0].content).transactions[0].merchant, 'Cava');
  assert.equal(s.txns[0].ai.categoryId, recreation);
  assert.equal(claudeSuggester({ apiKey: '' }), null, 'no key means no AI');

  // The server keeps syncing when the AI call fails.
  const broken = async () => { throw new Error('API down'); };
  const client = { configured: true, call: async (p) => p === '/transactions/sync' ? { added: [plaidTxn('n1', 5, { name: 'New shop' })], modified: [], removed: [], next_cursor: 'c', has_more: false, accounts: [] } : {} };
  const store = sqliteStore(':memory:');
  const app = await createApp({ client, store, categorize: broken });
  app.state.items.push({ id: 'item1', name: 'Bank', token: 't', cursor: '', lastSync: null, error: null });
  const warn = console.warn; console.warn = () => {};
  try { await app.refreshStale(); } finally { console.warn = warn; }
  assert.ok(app.state.txns.some(t => t.id === 'n1'));
  store.close();
});
