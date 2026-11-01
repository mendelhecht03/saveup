import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { CATEGORIES, LIMITS } from '../prototype/dist/model.js';

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export { CATEGORIES };

export function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InputError('Invalid imported amount.');
  const scaled = Math.round(value * 100);
  if (!Number.isSafeInteger(scaled) || Math.abs(value * 100 - scaled) > 0.00001) throw new InputError('Unsupported precision in imported amount.');
  return scaled;
}

function normalize(raw, accounts) {
  if (!raw || typeof raw.transaction_id !== 'string' || typeof raw.account_id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new InputError('Invalid imported transaction.');
  const signedCents = cents(raw.amount);
  const name = String(raw.merchant_name || raw.name || 'Unknown merchant').slice(0, 200);
  const primary = raw.personal_finance_category?.primary || '';
  // Inflows are always unresolved until explicitly classified, including refunds.
  const transfer = signedCents <= 0 || /TRANSFER|LOAN_PAYMENTS/.test(primary) || /\b(zelle|venmo|paypal|transfer|payment to|payment thank you)\b/i.test(raw.name || name);
  const account = accounts.get(raw.account_id);
  return { externalId: raw.transaction_id, pendingId: raw.pending_transaction_id || null,
    accountId: raw.account_id, name, date: raw.date, signedCents, amount: Math.abs(signedCents),
    currency: raw.iso_currency_code || raw.unofficial_currency_code || 'Unknown',
    status: raw.pending ? 'pending' : 'posted', kind: transfer ? 'transfer' : 'purchase',
    direction: signedCents < 0 ? 'in' : 'out', account: account ? `${account.name}${account.mask ? ` · ${account.mask}` : ''}` : 'Linked account' };
}

export class Store {
  constructor(filename, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('A 32-byte local encryption key is required.');
    this.key = key;
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, token TEXT NOT NULL, cursor TEXT NOT NULL DEFAULT '', synced TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), external_id TEXT NOT NULL,
        source TEXT NOT NULL, review TEXT NOT NULL DEFAULT '{}', removed INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(item_id,external_id));
      CREATE TABLE IF NOT EXISTS budgets (name TEXT PRIMARY KEY COLLATE NOCASE, limit_cents INTEGER NOT NULL CHECK(limit_cents>0), description TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('userId', randomUUID());
    const seedBudget = this.db.prepare('INSERT OR IGNORE INTO budgets VALUES (?,?,?)');
    for (const category of CATEGORIES) seedBudget.run(category, LIMITS[category], `Weekly ${category.toLowerCase()} spending`);
  }
  close() { this.db.close(); }
  get userId() { return this.db.prepare('SELECT value FROM settings WHERE key=?').get('userId').value; }
  seal(text) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64url')).join('.');
  }
  open(text) {
    const [iv, tag, data] = text.split('.').map(s => Buffer.from(s, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
  addItem({ id, provider, name, token }) {
    if (!['fixture', 'plaid'].includes(provider)) throw new InputError('Unknown provider.');
    if (provider === 'plaid' && !token.startsWith('access-sandbox-')) throw new InputError('Only Sandbox access tokens are allowed.');
    this.db.prepare(`INSERT INTO items(id,provider,name,token) VALUES (?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET token=excluded.token, name=excluded.name`).run(id, provider, name, this.seal(token));
  }
  items() { return this.db.prepare('SELECT * FROM items ORDER BY rowid').all(); }
  failItem(id, code) { this.db.prepare('UPDATE items SET error=? WHERE id=?').run(code, id); }
  find(itemId, externalId) { return this.db.prepare('SELECT * FROM transactions WHERE item_id=? AND external_id=?').get(itemId, externalId); }
  saveBudget({ name, limitCents, description }) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new InputError('Give the budget a name up to 60 characters.');
    if (!Number.isSafeInteger(limitCents) || limitCents <= 0) throw new InputError('Set a positive weekly limit, in whole cents.');
    const existing = this.db.prepare('SELECT * FROM budgets WHERE name=?').get(name.trim());
    const details = description === undefined && existing ? existing.description : description;
    if (typeof details !== 'string' || !details.trim() || details.trim().length > 300) throw new InputError('Describe what this budget covers, up to 300 characters.');
    this.db.prepare(`INSERT INTO budgets(name,limit_cents,description) VALUES (?,?,?)
      ON CONFLICT(name) DO UPDATE SET limit_cents=excluded.limit_cents,description=excluded.description`).run(name.trim(), limitCents, details.trim());
  }
  applySync(itemId, batch) {
    const accounts = new Map(batch.accounts.map(a => [a.account_id, a]));
    // Validation occurs before the transaction. A malformed later row cannot commit a partial page.
    const updates = [...batch.added, ...batch.modified].map(raw => normalize(raw, accounts));
    if (batch.removed.some(r => typeof r.transaction_id !== 'string') || typeof batch.cursor !== 'string') throw new InputError('Invalid sync update.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const source of updates) {
        const current = this.find(itemId, source.externalId);
        const pending = source.pendingId && this.find(itemId, source.pendingId);
        const existing = current || pending;
        const review = existing ? JSON.parse(existing.review) : {};
        const old = existing && JSON.parse(existing.source);
        if (old && (old.signedCents !== source.signedCents || old.currency !== source.currency || old.accountId !== source.accountId || old.kind !== source.kind)) {
          review.reviewed = false; review.changed = true;
        }
        if (existing) {
          this.db.prepare('UPDATE transactions SET external_id=?,source=?,review=?,removed=0,revision=revision+1 WHERE id=?')
            .run(source.externalId, JSON.stringify(source), JSON.stringify(review), existing.id);
          if (pending && pending.id !== existing.id) this.db.prepare('UPDATE transactions SET removed=1,revision=revision+1 WHERE id=?').run(pending.id);
        } else {
          this.db.prepare('INSERT INTO transactions(id,item_id,external_id,source) VALUES (?,?,?,?)').run(randomUUID(), itemId, source.externalId, JSON.stringify(source));
        }
      }
      for (const removed of batch.removed) this.db.prepare('UPDATE transactions SET removed=1,revision=revision+1 WHERE item_id=? AND external_id=?').run(itemId, removed.transaction_id);
      this.db.prepare('UPDATE items SET cursor=?,synced=?,error=NULL WHERE id=?').run(batch.cursor, new Date().toISOString(), itemId);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  review(id, draft) {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id=? AND removed=0').get(id);
    if (!row) throw new InputError('Transaction not found.', 404);
    if (!Number.isInteger(draft.revision) || row.revision !== draft.revision) throw new InputError('This transaction changed. Reload its details before saving.', 409);
    const source = JSON.parse(row.source);
    if (source.currency !== 'USD') throw new InputError('This first milestone supports review of USD transactions only.');
    const purpose = draft.classification || '';
    if (source.kind === 'transfer' && !['own', 'income', 'expense'].includes(purpose)) throw new InputError('Choose the purpose of this money first.');
    if (purpose === 'income' && source.direction !== 'in') throw new InputError('Outgoing money cannot become income.');
    if (purpose === 'expense' && source.direction !== 'out') throw new InputError('Incoming money cannot become a new expense. Refund matching comes later.');
    if (source.kind === 'purchase' && purpose) throw new InputError('Purchase purpose cannot be overridden as a transfer.');
    const budget = typeof draft.category === 'string' ? this.db.prepare('SELECT name FROM budgets WHERE name=?').get(draft.category) : null;
    if ((source.kind === 'purchase' || purpose === 'expense') && (!budget || source.amount === 0)) throw new InputError('Choose a valid budget category.');
    for (const field of ['description', 'note']) if (typeof draft[field] !== 'string' || draft[field].length > 2000) throw new InputError('Notes must be text up to 2,000 characters.');
    const review = { reviewed: true, changed: false, classification: purpose,
      category: source.kind === 'purchase' || purpose === 'expense' ? budget.name : '', description: draft.description, note: draft.note };
    this.db.prepare('UPDATE transactions SET review=?,revision=revision+1 WHERE id=?').run(JSON.stringify(review), id);
  }
  state() {
    const items = this.items().map(({ id, provider, name, synced, error }) => ({ id, provider, name, synced, error }));
    const transactions = this.db.prepare('SELECT * FROM transactions WHERE removed=0').all().map(row => ({
      ...JSON.parse(row.source), ...JSON.parse(row.review), id: row.id, itemId: row.item_id, revision: row.revision
    })).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    const budgets = this.db.prepare('SELECT name,limit_cents AS limitCents,description FROM budgets ORDER BY rowid').all();
    return { items, transactions, budgets, categories: budgets.map(budget => budget.name) };
  }
}
