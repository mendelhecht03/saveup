// SQLite storage (node:sqlite, built into Node 24). The app keeps working on one
// state object in memory; this file turns it into tables and back. Every save is
// one transaction, so a crash mid-save leaves the previous data intact.
import path from 'node:path';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import * as L from './public/logic.mjs';

// Each table lists [field on the object, column, kind]. Kinds: 'bool' is stored
// as 0/1, 'json' as text, anything else as is. Fields not listed are not saved.
const TABLES = {
  items: [['id', 'id'], ['name', 'name'], ['token', 'access_token'], ['cursor', 'cursor'], ['lastSync', 'last_sync'], ['error', 'error']],
  accounts: [['id', 'id'], ['itemId', 'item_id'], ['name', 'name'], ['mask', 'mask']],
  categories: [['id', 'id'], ['emoji', 'emoji'], ['name', 'name'], ['description', 'description'], ['limitCents', 'limit_cents'], ['interval', 'interval']],
  txns: [
    ['id', 'id'], ['source', 'source'], ['itemId', 'item_id'], ['accountId', 'account_id'], ['name', 'name'],
    ['amountCents', 'amount_cents'], ['date', 'date'], ['pending', 'pending', 'bool'], ['pfc', 'pfc'],
    ['transfer', 'transfer', 'bool'], ['transferKind', 'transfer_kind'], ['categoryId', 'category_id'],
    ['note', 'note'], ['priority', 'priority'], ['reviewed', 'reviewed', 'bool'], ['amountChanged', 'amount_changed', 'bool'],
    ['expectMatch', 'expect_match', 'bool'], ['verified', 'verified', 'bool'], ['matchedFrom', 'matched_from'],
    ['ai', 'ai_suggestion', 'json'], ['suggestionTaken', 'suggestion_taken']
  ],
  plans: [['id', 'id'], ['name', 'name'], ['lowCents', 'low_cents'], ['highCents', 'high_cents'], ['categoryId', 'category_id'], ['essential', 'essential', 'bool']],
  rules: [['key', 'key'], ['categoryId', 'category_id'], ['transferKind', 'transfer_kind']]
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, name TEXT, access_token TEXT, cursor TEXT, last_sync TEXT, error TEXT);
  CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, item_id TEXT, name TEXT, mask TEXT);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, emoji TEXT, name TEXT, description TEXT, limit_cents INTEGER, interval TEXT);
  CREATE TABLE IF NOT EXISTS txns (id TEXT PRIMARY KEY, source TEXT, item_id TEXT, account_id TEXT, name TEXT, amount_cents INTEGER,
    date TEXT, pending INTEGER, pfc TEXT, transfer INTEGER, transfer_kind TEXT, category_id TEXT, note TEXT, priority INTEGER,
    reviewed INTEGER, amount_changed INTEGER, expect_match INTEGER, verified INTEGER, matched_from TEXT, ai_suggestion TEXT, suggestion_taken TEXT);
  CREATE INDEX IF NOT EXISTS txns_date ON txns (date);
  CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT, low_cents INTEGER, high_cents INTEGER, category_id TEXT, essential INTEGER);
  CREATE TABLE IF NOT EXISTS rules (key TEXT PRIMARY KEY, category_id TEXT, transfer_kind TEXT);
`;

const toRow = (obj, cols) => cols.map(([f, , kind]) => {
  const v = obj[f];
  if (v === undefined || v === null) return null;
  return kind === 'bool' ? (v ? 1 : 0) : kind === 'json' ? JSON.stringify(v) : v;
});
const fromRow = (row, cols) => {
  const obj = {};
  for (const [f, c, kind] of cols) {
    const v = row[c];
    if (kind === 'bool') obj[f] = v === 1;
    else if (kind === 'json') { if (v != null) obj[f] = JSON.parse(v); }
    else obj[f] = v;
  }
  return obj;
};

// `legacyFile` is the old state.json; it is copied in once, the first time, and left in place.
export function sqliteStore(file, { legacyFile } = {}) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const all = name => db.prepare(`SELECT * FROM ${name}`).all().map(r => fromRow(r, TABLES[name]));

  function save(state) {
    const rows = {
      items: state.items,
      accounts: Object.entries(state.accounts).map(([id, a]) => ({ id, ...a })),
      categories: state.categories, txns: state.txns, plans: state.plans,
      rules: Object.entries(state.rules).map(([key, r]) => ({ key, ...r }))
    };
    db.exec('BEGIN');
    try {
      for (const [name, cols] of Object.entries(TABLES)) {
        db.exec(`DELETE FROM ${name}`);
        const insert = db.prepare(`INSERT INTO ${name} (${cols.map(c => c[1]).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        for (const r of rows[name]) insert.run(...toRow(r, cols));
      }
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('version', String(state.version));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  function load() {
    const version = db.prepare("SELECT value FROM meta WHERE key = 'version'").get()?.value;
    if (!version) {
      // A brand-new database: import the old JSON file if there is one, otherwise start fresh.
      const state = legacyFile && existsSync(legacyFile) ? JSON.parse(readFileSync(legacyFile, 'utf8')) : L.newState();
      L.upgradeState(state);
      save(state);
      return state;
    }
    const state = {
      version: Number(version), items: all('items'), categories: all('categories'), txns: all('txns'), plans: all('plans'),
      accounts: Object.fromEntries(all('accounts').map(({ id, ...a }) => [id, a])),
      rules: Object.fromEntries(all('rules').map(({ key, ...r }) => [key, r]))
    };
    return L.upgradeState(state);
  }

  return { load: async () => load(), save: async state => save(state), close: () => db.close() };
}
