import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as L from '../public/logic.mjs';
import { sqliteStore } from '../db.mjs';

const plaidTxn = (id, amount, extra = {}) => ({ transaction_id: id, account_id: 'a1', name: 'Kahans', amount, date: '2026-11-03', pending: false, ...extra });

test('SQLite saves and loads every part of the state unchanged', async () => {
  const store = sqliteStore(':memory:');
  const s = await store.load();
  s.items.push({ id: 'item1', name: 'Test bank', token: 'access-sandbox-x', cursor: 'c1', lastSync: '2026-11-03T10:00:00Z', error: null });
  L.applySync(s, 'item1', { accounts: [{ account_id: 'a1', name: 'Checking', mask: '0001' }], added: [plaidTxn('k1', 2.53), plaidTxn('z1', 40, { name: 'Zelle to Josh' })] });
  L.confirmTxn(s, { id: 'k1', categoryId: 'preset-1', priority: L.ESSENTIAL });
  s.txns.find(t => t.id === 'z1').ai = { categoryId: null, transferKind: 'spending', reason: 'Paid a friend' };
  L.addManual(s, { merchant: 'Target', amountCents: 15000, date: '2026-11-02', categoryId: 'preset-1', expectMatch: true }, 'm1');
  L.savePlan(s, { name: 'Guitar', lowCents: 10000, highCents: 30000, categoryId: 'preset-2', essential: true }, 'p1');
  await store.save(s);

  const back = await store.load();
  assert.deepEqual(back.items, s.items);
  assert.deepEqual(back.accounts, s.accounts);
  assert.deepEqual(back.rules, s.rules);
  assert.deepEqual(back.plans, s.plans);
  assert.deepEqual(back.categories, s.categories);
  const byId = id => back.txns.find(t => t.id === id);
  assert.equal(byId('k1').reviewed, true);
  assert.equal(byId('k1').priority, L.ESSENTIAL);
  assert.equal(byId('k1').amountCents, 253);
  assert.deepEqual(byId('z1').ai, { categoryId: null, transferKind: 'spending', reason: 'Paid a friend' });
  assert.equal(byId('z1').transfer, true);
  assert.equal(byId('m1').expectMatch, true);
  assert.equal(byId('m1').verified, false);
  const totals = st => L.budgetSummary(st, '2026-11-04').map(b => [b.id, b.spent, b.pending, b.plannedHigh]);
  assert.deepEqual(totals(back), totals(s));
  store.close();
});

test('a new database imports the old state.json once and renames Essentials to Household', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'saveup-'));
  try {
    const old = L.newState();
    old.version = 1;
    old.categories.unshift({ id: 'preset-0', emoji: '🧴', name: 'Essentials', description: 'Everyday necessities', limitCents: 5000, interval: 'weekly' });
    L.applySync(old, 'item1', { added: [plaidTxn('k1', 2.53)] });
    L.confirmTxn(old, { id: 'k1', categoryId: 'preset-0' });
    old.txns[0].priority = 5;
    const legacyFile = path.join(dir, 'state.json');
    writeFileSync(legacyFile, JSON.stringify(old));

    const file = path.join(dir, 'saveup.sqlite');
    const first = sqliteStore(file, { legacyFile });
    const s = await first.load();
    assert.equal(s.categories.find(c => c.id === 'preset-0').name, 'Household', 'the old Essentials budget keeps its purchases under a new name');
    assert.equal(s.txns[0].categoryId, 'preset-0');
    assert.equal(s.txns[0].priority, L.ESSENTIAL);
    assert.ok(!s.categories.some(c => c.name === 'Essentials'));
    first.close();

    // Changing the old file later has no effect: it was imported once.
    writeFileSync(legacyFile, JSON.stringify(L.newState()));
    const again = sqliteStore(file, { legacyFile });
    assert.equal((await again.load()).txns.length, 1);
    again.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('new users get the presets without an Essentials budget', () => {
  const names = L.newState().categories.map(c => c.name);
  assert.ok(!names.includes('Essentials'));
  assert.deepEqual(L.PRIORITIES.at(-1), 'Essential');
});
