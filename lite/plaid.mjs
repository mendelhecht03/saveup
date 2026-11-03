// Minimal Plaid client. Lite is Sandbox-only on purpose: fictional banks, no real money data.
const HOST = 'https://sandbox.plaid.com';

export class PlaidError extends Error {
  constructor(code, message) { super(message || code); this.code = code; this.status = 502; }
}

export function plaidClient({ clientId, secret, fetchImpl = fetch }) {
  const configured = Boolean(clientId && secret);
  async function call(endpoint, payload) {
    if (!configured) throw new PlaidError('CREDENTIALS_MISSING', 'Add your Plaid Sandbox keys to lite/.env.local.');
    let response;
    try {
      response = await fetchImpl(`${HOST}${endpoint}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret, 'Plaid-Version': '2020-09-14' },
        body: JSON.stringify(payload)
      });
    } catch { throw new PlaidError('PLAID_CONNECTION_FAILED', 'Could not reach Plaid. Check the internet connection.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok && /RATE_LIMIT/.test(data.error_type || data.error_code || '')) throw new PlaidError('RATE_LIMIT_EXCEEDED', 'Plaid’s Sandbox is rate-limiting test charges. Wait a minute and try again.');
    if (!response.ok) throw new PlaidError(/^[A-Z0-9_]+$/.test(data.error_code) ? data.error_code : 'PLAID_REQUEST_FAILED', typeof data.error_message === 'string' ? data.error_message.slice(0, 300) : undefined);
    return data;
  }
  return { configured, call };
}

// Collect every page before changing local data, restarting from the original
// cursor if Plaid reports the data changed mid-pagination.
export async function collectUpdates(call, accessToken, originalCursor = '') {
  for (let attempt = 0; ; attempt++) {
    let cursor = originalCursor;
    const batch = { added: [], modified: [], removed: [], accounts: [] };
    try {
      for (let page = 0; page < 50; page++) {
        const data = await call('/transactions/sync', { access_token: accessToken, cursor: cursor || undefined, count: 500 });
        for (const key of Object.keys(batch)) batch[key].push(...(data[key] || []));
        cursor = data.next_cursor;
        if (!data.has_more) return { ...batch, cursor, status: data.transactions_update_status };
      }
      throw new PlaidError('PLAID_PAGE_LIMIT_REACHED');
    } catch (error) {
      if (error.code !== 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' || attempt >= 2) throw error;
    }
  }
}
