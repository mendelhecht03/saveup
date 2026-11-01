// Plaid-shaped local fixtures exercise the SAME importer as Sandbox responses.
const accounts = [{ account_id: 'demo-card', name: 'Sample Visa', mask: '4821' }, { account_id: 'demo-checking', name: 'Sample Checking', mask: '1904' }];
const transaction = (id, name, amount, date, extra = {}) => ({ transaction_id: id, account_id: 'demo-card', name, merchant_name: name,
  amount, date, pending: false, pending_transaction_id: null, iso_currency_code: 'USD', ...extra });
export function fixtureBatch(posted = false) {
  return {
    accounts, cursor: posted ? 'demo-posted' : 'demo-initial', modified: [],
    removed: posted ? [{ transaction_id: 'demo-groceries-pending' }] : [],
    added: posted ? [transaction('demo-groceries-posted', 'Freshmart', 32, '2026-11-04', { pending_transaction_id: 'demo-groceries-pending' })] : [
      transaction('demo-kahan', 'Kahan’s', 2.53, '2026-11-03'), transaction('demo-target', 'Target', 11, '2026-11-03'),
      transaction('demo-groceries-pending', 'Freshmart', 30, '2026-11-04', { pending: true }),
      transaction('demo-zelle', 'Zelle · Alex Morgan', -200, '2026-11-03', { account_id: 'demo-checking' }),
      transaction('demo-savings', 'Transfer to savings', 100, '2026-11-02', { account_id: 'demo-checking' }),
      transaction('demo-cafe', 'Corner café', 5.5, '2026-11-01'),
      transaction('demo-refund', 'Refund · Clothing store', -10, '2026-11-02')
    ]
  };
}
