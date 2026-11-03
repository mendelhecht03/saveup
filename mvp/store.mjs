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

const words = value => new Set(String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length >= 3 && !['the', 'and', 'inc', 'llc', 'store', 'shop', 'pos', 'purchase'].includes(w)));
function similarName(a, b) {
  const left = words(a), right = words(b);
  for (const word of left) if (right.has(word)) return true;
  const x = String(a).toLowerCase().replace(/[^a-z0-9]/g, ''), y = String(b).toLowerCase().replace(/[^a-z0-9]/g, '');
  return x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x));
}
const daysBetween = (a, b) => (Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000;
// Bank charges a receipt could belong to. Exact totals match; a close total (a tip added later) needs a similar name.
// The user always confirms; nothing is linked automatically.
export function receiptMatches(receipt, transactions, taken = new Set()) {
  return transactions.filter(t => !taken.has(t.id) && t.kind === 'purchase' && t.direction === 'out' && t.currency === 'USD').map(t => {
    const lag = daysBetween(receipt.date, t.date), named = similarName(receipt.merchant, t.merchant || t.name);
    const difference = t.amount - receipt.totalCents, exact = difference === 0;
    const near = !exact && named && Math.abs(difference) <= Math.max(500, Math.round(receipt.totalCents / 4));
    if (!(lag >= -3 && lag <= 10 && ((exact && (named || Math.abs(lag) <= 3)) || near))) return null;
    return { transactionId: t.id, name: t.merchant || t.name, date: t.date, amount: t.amount, account: t.account, status: t.status, reviewed: Boolean(t.reviewed), exact, difference };
  }).filter(Boolean).sort((a, b) => b.exact - a.exact || Math.abs(a.difference) - Math.abs(b.difference) || Math.abs(daysBetween(receipt.date, a.date)) - Math.abs(daysBetween(receipt.date, b.date)));
}
const plainText = (value, max) => typeof value === 'string' && value.trim() && value.trim().length <= max && !/[\u0000-\u001f\u007f]/.test(value);

export class Store {
  constructor(filename, key, environment = 'sandbox') {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('A 32-byte local encryption key is required.');
    if (!['sandbox', 'production'].includes(environment)) throw new Error('Unknown Plaid environment.');
    this.key = key;
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, provider TEXT NOT NULL, name TEXT NOT NULL, token TEXT NOT NULL, cursor TEXT NOT NULL DEFAULT '', synced TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), external_id TEXT NOT NULL,
        source TEXT NOT NULL, review TEXT NOT NULL DEFAULT '{}', removed INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(item_id,external_id));
      CREATE TABLE IF NOT EXISTS budgets (name TEXT PRIMARY KEY COLLATE NOCASE, limit_cents INTEGER NOT NULL CHECK(limit_cents>0), description TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipt_images (id TEXT PRIMARY KEY, media_type TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, image_id TEXT REFERENCES receipt_images(id), transaction_id TEXT UNIQUE REFERENCES transactions(id),
        status TEXT NOT NULL CHECK(status IN ('linked','watching','cash')), data TEXT NOT NULL, created TEXT NOT NULL);`);
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('userId', randomUUID());
    // A data folder belongs to one environment for life, so test and real bank records never mix.
    // Folders created before this label existed could only hold Sandbox data.
    const legacy = this.db.prepare('SELECT COUNT(*) AS n FROM items').get().n > 0;
    this.db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('environment', legacy ? 'sandbox' : environment);
    const recorded = this.db.prepare('SELECT value FROM settings WHERE key=?').get('environment').value;
    if (recorded !== environment) { this.db.close(); throw new Error(`This data folder holds ${recorded} data; use a separate folder for ${environment}.`); }
    this.environment = environment;
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
    if (provider === 'fixture' && this.environment !== 'sandbox') throw new InputError('Sample data is only available in Sandbox.');
    if (provider === 'plaid' && !token.startsWith(`access-${this.environment}-`)) throw new InputError(`Only ${this.environment} access tokens are allowed here.`);
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
  saveReceiptImage(base64, mediaType) {
    // Photos that were scanned but never saved are kept for a day, then removed.
    this.db.prepare('DELETE FROM receipt_images WHERE created < ? AND id NOT IN (SELECT image_id FROM receipts WHERE image_id IS NOT NULL)').run(new Date(Date.now() - 86400000).toISOString());
    const id = randomUUID();
    this.db.prepare('INSERT INTO receipt_images VALUES (?,?,?,?)').run(id, mediaType, this.seal(base64), new Date().toISOString());
    return id;
  }
  receiptImage(id) {
    const row = this.db.prepare('SELECT * FROM receipt_images WHERE id=?').get(id);
    return row ? { mediaType: row.media_type, data: Buffer.from(this.open(row.data), 'base64') } : null;
  }
  checkReceipt(draft) {
    if (!draft || typeof draft !== 'object') throw new InputError('Receipt details are missing.');
    if (!plainText(draft.merchant, 200)) throw new InputError('Give the receipt a merchant name.');
    if (typeof draft.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date + 'T12:00:00Z'))) throw new InputError('Add the receipt date.');
    if (!Array.isArray(draft.items) || !draft.items.length || draft.items.length > 200) throw new InputError('List at least one item from the receipt.');
    const items = draft.items.map(item => {
      if (!plainText(item?.name, 200)) throw new InputError('Every receipt line needs a name.');
      if (!Number.isSafeInteger(item.amountCents)) throw new InputError('Every receipt line needs an amount in whole cents.');
      // An empty category means "same as the purchase"; a named one sends that line to its own budget.
      const category = item.category ? this.budgetName(item.category) : '';
      return { name: item.name.trim(), printed: typeof item.printed === 'string' ? item.printed.slice(0, 200) : '', amountCents: item.amountCents, category };
    });
    const byCategory = new Map();
    for (const item of items) byCategory.set(item.category, (byCategory.get(item.category) || 0) + item.amountCents);
    if (byCategory.size > 1 && [...byCategory.values()].some(total => total < 0)) throw new InputError('A discount is larger than the items in its budget. Put the discount in the same budget as the item it reduces.');
    for (const field of ['taxCents', 'tipCents']) if (!Number.isSafeInteger(draft[field]) || draft[field] < 0) throw new InputError('Tax and tip must be zero or more, in whole cents.');
    if (!Number.isSafeInteger(draft.totalCents) || draft.totalCents <= 0) throw new InputError('The receipt total must be more than zero.');
    const sum = items.reduce((total, item) => total + item.amountCents, 0) + draft.taxCents + draft.tipCents;
    if (sum !== draft.totalCents) throw new InputError(`Items, tax and tip add up to $${(sum / 100).toFixed(2)}, but the total is $${(draft.totalCents / 100).toFixed(2)}. Fix a line or add one for the difference.`);
    const imageId = draft.imageId || null;
    if (imageId !== null && (typeof imageId !== 'string' || !this.db.prepare('SELECT 1 FROM receipt_images WHERE id=?').get(imageId))) throw new InputError('The receipt photo has expired. Scan it again.');
    return { merchant: draft.merchant.trim(), date: draft.date, items, taxCents: draft.taxCents, tipCents: draft.tipCents, totalCents: draft.totalCents, imageId };
  }
  budgetName(category) {
    const budget = typeof category === 'string' ? this.db.prepare('SELECT name FROM budgets WHERE name=?').get(category) : null;
    if (!budget) throw new InputError('Choose a valid budget category.');
    return budget.name;
  }
  // A receipt scanned before its bank charge. "watching" counts as unverified spending until matched; "cash" never waits for a bank.
  // Also used for purchases entered by hand (no photo). Passing an id edits one that is not yet matched to a bank charge.
  saveReceipt({ id, receipt, category, description = '', watch }) {
    const checked = this.checkReceipt(receipt);
    if (typeof description !== 'string' || description.length > 2000) throw new InputError('Notes must be text up to 2,000 characters.');
    if (typeof watch !== 'boolean') throw new InputError('Choose whether to watch for the bank charge.');
    const { imageId, ...data } = checked;
    const fields = [watch ? 'watching' : 'cash', JSON.stringify({ ...data, category: this.budgetName(category), description })];
    if (id !== undefined) {
      const row = typeof id === 'string' && this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);
      if (!row) throw new InputError('Purchase not found.', 404);
      if (row.status === 'linked') throw new InputError('This purchase is matched to a bank charge. Edit it from that charge instead.');
      this.db.prepare('UPDATE receipts SET status=?,data=?,image_id=? WHERE id=?').run(...fields, imageId ?? row.image_id, id);
      return id;
    }
    const created = randomUUID();
    this.db.prepare('INSERT INTO receipts(id,image_id,transaction_id,status,data,created) VALUES (?,?,NULL,?,?,?)').run(created, imageId, ...fields, new Date().toISOString());
    return created;
  }
  removeReceipt(id) {
    const row = typeof id === 'string' && this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);
    if (!row) throw new InputError('Receipt not found.', 404);
    if (row.status === 'linked') throw new InputError('This receipt belongs to a reviewed purchase. Replace it from that purchase instead.');
    this.db.prepare('DELETE FROM receipts WHERE id=?').run(id);
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
    if (draft.merchant !== undefined && draft.merchant !== '' && !plainText(draft.merchant, 200)) throw new InputError('Merchant names can be up to 200 characters.');
    const priority = draft.priority === undefined || draft.priority === '' ? 0 : Number(draft.priority);
    if (!Number.isInteger(priority) || priority < 0 || priority > 5) throw new InputError('Priority goes from 1 to 5.');
    const linked = this.db.prepare('SELECT * FROM receipts WHERE transaction_id=?').get(id);
    let receipt = null, reuse = null;
    if (draft.receipt) {
      if (source.kind !== 'purchase') throw new InputError('Receipts can be added to purchases only.');
      receipt = this.checkReceipt(draft.receipt);
      if (draft.receipt.id) {
        reuse = this.db.prepare('SELECT * FROM receipts WHERE id=?').get(draft.receipt.id);
        if (!reuse || (reuse.status === 'linked' && reuse.transaction_id !== id)) throw new InputError('That receipt is already attached to another purchase.');
      }
    }
    const receiptId = receipt ? reuse?.id || linked?.id || randomUUID() : linked?.id || '';
    const merchant = (receipt?.merchant || draft.merchant || '').trim();
    const review = { reviewed: true, changed: false, classification: purpose,
      category: source.kind === 'purchase' || purpose === 'expense' ? budget.name : '', description: draft.description, note: draft.note,
      ...(merchant && merchant !== source.name ? { merchant } : {}), ...(receiptId ? { receiptId } : {}), ...(priority ? { priority } : {}) };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (receipt) {
        const { imageId, ...data } = receipt;
        // Matching a watched receipt converts it, so its spending is never counted twice.
        if (linked && linked.id !== receiptId) this.db.prepare('DELETE FROM receipts WHERE id=?').run(linked.id);
        this.db.prepare(`INSERT INTO receipts(id,image_id,transaction_id,status,data,created) VALUES (?,?,?,'linked',?,?)
          ON CONFLICT(id) DO UPDATE SET image_id=excluded.image_id,transaction_id=excluded.transaction_id,status='linked',data=excluded.data`)
          .run(receiptId, imageId, id, JSON.stringify(data), new Date().toISOString());
      }
      this.db.prepare('UPDATE transactions SET review=?,revision=revision+1 WHERE id=?').run(JSON.stringify(review), id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  receiptDuplicates(receipt, transactions, ignoreId = null) {
    const all = this.receipts(), taken = new Set(all.filter(r => r.transactionId).map(r => r.transactionId));
    const others = all.filter(r => r.id !== ignoreId && r.totalCents === receipt.totalCents && r.date === receipt.date && similarName(r.merchant, receipt.merchant));
    return { receipts: others.map(({ id, merchant, date, totalCents, status, transactionId }) => ({ id, merchant, date, totalCents, status, transactionId })),
      transactions: receipt.date ? receiptMatches(receipt, transactions, taken) : [] };
  }
  receipts() {
    return this.db.prepare('SELECT * FROM receipts ORDER BY created DESC').all().map(row => ({
      ...JSON.parse(row.data), id: row.id, status: row.status, transactionId: row.transaction_id, imageId: row.image_id, created: row.created }));
  }
  state() {
    const items = this.items().map(({ id, provider, name, synced, error }) => ({ id, provider, name, synced, error }));
    const transactions = this.db.prepare('SELECT * FROM transactions WHERE removed=0').all().map(row => ({
      ...JSON.parse(row.source), ...JSON.parse(row.review), id: row.id, itemId: row.item_id, revision: row.revision
    })).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
    const budgets = this.db.prepare('SELECT name,limit_cents AS limitCents,description FROM budgets ORDER BY rowid').all();
    const receipts = this.receipts(), taken = new Set(receipts.filter(r => r.transactionId).map(r => r.transactionId));
    for (const receipt of receipts) receipt.matches = receipt.status === 'watching' ? receiptMatches(receipt, transactions, taken) : [];
    return { items, transactions, budgets, receipts, categories: budgets.map(budget => budget.name) };
  }
}
