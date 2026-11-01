// This adapter can only contact Plaid Sandbox. No Production URL is configurable.
export class PlaidError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}

export function plaidClient({ clientId, secret, environment = 'sandbox', fetchImpl = fetch }) {
  if (environment !== 'sandbox') throw new Error('This milestone supports PLAID_ENV=sandbox only.');
  const configured = Boolean(clientId && secret);
  async function call(endpoint, payload) {
    if (!configured) throw new PlaidError('SANDBOX_CREDENTIALS_MISSING', 503);
    let response;
    try {
      response = await fetchImpl(`https://sandbox.plaid.com${endpoint}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret, 'Plaid-Version': '2020-09-14' },
        body: JSON.stringify(payload)
      });
    } catch { throw new PlaidError('PLAID_CONNECTION_FAILED'); }
    let data;
    try { data = await response.json(); } catch { throw new PlaidError('PLAID_INVALID_RESPONSE'); }
    if (!response.ok) {
      const code = /^[A-Z0-9_]+$/.test(data.error_code) ? data.error_code : 'PLAID_REQUEST_FAILED';
      throw new PlaidError(code);
    }
    return data;
  }
  return { configured, call };
}

// Collect the WHOLE update before touching SQLite. On mutation, restart at the
// originally committed cursor, not at the page that happened to fail.
export async function collectUpdates(call, accessToken, originalCursor = '') {
  for (let attempt = 0; attempt < 3; attempt++) {
    let cursor = originalCursor;
    const batch = { added: [], modified: [], removed: [], accounts: [], cursor };
    try {
      for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
        const page = await call('/transactions/sync', { access_token: accessToken, cursor, count: 500 });
        for (const key of ['added', 'modified', 'removed', 'accounts']) {
          if (!Array.isArray(page[key])) throw new PlaidError('PLAID_INVALID_RESPONSE');
          batch[key].push(...page[key]);
        }
        if (typeof page.next_cursor !== 'string' || typeof page.has_more !== 'boolean') throw new PlaidError('PLAID_INVALID_RESPONSE');
        if (page.has_more && page.next_cursor === cursor) throw new PlaidError('PLAID_CURSOR_STALLED');
        cursor = page.next_cursor;
        if (!page.has_more) return { ...batch, cursor };
      }
      throw new PlaidError('PLAID_PAGE_LIMIT_REACHED');
    } catch (error) {
      if (error.code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt === 2) throw error;
    }
  }
}
