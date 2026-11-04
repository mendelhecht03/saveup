// Receipt reading with Veryfi, a dedicated receipt OCR service, as an alternative
// to Claude. It returns the same shape as reader.mjs so the rest of the app
// doesn't care which one read the photo. Veryfi files each item into one of the
// person's budgets when it is given their names; nothing is confirmed until the
// person reviews it. Raw fetch because the app has no dependencies.
import { normalizeReading } from './reader.mjs';

const API = 'https://api.veryfi.com/api/v8/partner/documents';

// Veryfi fields can be plain values or { value, score } objects.
const val = v => (v && typeof v === 'object' && 'value' in v ? v.value : v);
const toCents = v => {
  const n = Number(val(v));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// Veryfi's answer -> SaveUp's reading. Exported so tests can use a saved answer.
export function fromVeryfi(doc, categories = []) {
  const byName = new Map(categories.map(c => [String(c.name).toLowerCase(), c.id]));
  const date = String(val(doc.date) || '');
  const card = String(val(doc.payment?.card_number) || '').replace(/\D/g, '');
  const type = String(val(doc.payment?.type) || '').toLowerCase();
  const lines = (doc.line_items || [])
    .filter(l => !/^(tax|discount|fee|shipping|tip)$/i.test(String(val(l.type) || '')) || toCents(l.total) < 0)
    .map(l => {
      const printed = String(val(l.text) || val(l.description) || '').split('\n')[0];
      const code = String(val(l.description) || printed);
      const name = String(val(l.full_description) || val(l.description) || code);
      const categoryId = byName.get(String(val(l.category) || '').toLowerCase()) || '';
      return { code, name, amountCents: toCents(l.total), categoryId, unsure: !categoryId };
    });
  return normalizeReading({
    merchant: val(doc.vendor?.name) || val(doc.vendor?.raw_name) || '',
    date: date.slice(0, 10),
    time: /\d{2}:\d{2}/.test(date) ? date.slice(11, 16) : '',
    last4: card.slice(-4),
    method: type === 'cash' ? 'cash' : card || /card|visa|master|amex|debit|credit/.test(type) ? 'card' : '',
    lines,
    taxCents: toCents(doc.tax),
    totalCents: toCents(doc.total)
  }, categories.map(c => c.id));
}

// `apiKey` is a Bearer key; with `username` it is a legacy "apikey USER:KEY" pair.
export function veryfiReceiptReader({ clientId, apiKey, username, fetchImpl = fetch } = {}) {
  if (!clientId || !apiKey) return null;
  const authorization = username ? `apikey ${username}:${apiKey}` : `Bearer ${apiKey}`;
  return {
    async read({ imageBase64, mediaType, categories = [] }) {
      const res = await fetchImpl(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'CLIENT-ID': clientId, authorization },
        body: JSON.stringify({
          file_data: imageBase64,
          file_name: `receipt.${mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg'}`,
          categories: categories.map(c => c.name)
        }),
        signal: AbortSignal.timeout(90_000)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Veryfi ${res.status}: ${data.message || data.error || 'request failed'}`);
      return fromVeryfi(data, categories);
    }
  };
}
