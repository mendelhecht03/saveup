// Receipt reading with Azure AI Document Intelligence (its prebuilt receipt
// model), as an alternative to Claude. It returns the same shape as reader.mjs
// so the rest of the app doesn't care which one read the photo. Azure reads
// the printed text and numbers but doesn't know the person's budgets, so every
// line comes back without a budget and marked unsure; the person picks them in
// review. Raw fetch because the app has no dependencies.
import { normalizeReading } from './reader.mjs';

const API_VERSION = '2024-11-30';
const wait = ms => new Promise(r => setTimeout(r, ms));

// Azure fields hold their value in a typed property (valueString, valueCurrency...).
const str = f => String(f?.valueString ?? f?.content ?? '').trim();
const num = f => (typeof f?.valueNumber === 'number' ? f.valueNumber : null);
const money = f => {
  const a = f?.valueCurrency?.amount ?? f?.valueNumber;
  return typeof a === 'number' && Number.isFinite(a) ? Math.round(a * 100) : null;
};
const obj = f => f?.valueObject || {};

// Azure's answer -> SaveUp's reading. Exported so tests can use a saved answer.
export function fromAzure(analyzeResult, categories = []) {
  const doc = analyzeResult?.documents?.[0];
  const f = doc?.fields || {};
  const lines = (f.Items?.valueArray || []).map(item => {
    const i = obj(item);
    const description = str(i.Description);
    const qty = num(i.Quantity), unit = money(i.Price);
    const amountCents = money(i.TotalPrice) ?? (unit != null ? Math.round(unit * (qty ?? 1)) : 0);
    return { code: str(i.ProductCode) || description, name: description || str(i.ProductCode), amountCents, categoryId: '', unsure: true };
  });
  const taxDetails = (f.TaxDetails?.valueArray || []).map(t => money(obj(t).Amount)).filter(a => a != null);
  const taxCents = money(f.TotalTax) ?? taxDetails.reduce((s, a) => s + a, 0);
  const payment = (f.Payments?.valueArray || []).map(p => str(obj(p).Method).toLowerCase()).join(' ');
  // Azure has no card-number field; the masked number is usually in the raw text
  // ("**** 1234", "XXXX1234", or bullets that Azure writes as middle dots "···· 1234").
  const last4 = String(analyzeResult?.content || '').match(/(?:[*xX•·∙●]{3,}[\s-]*)(\d{4})\b/)?.[1] || '';
  return normalizeReading({
    merchant: str(f.MerchantName),
    date: String(f.TransactionDate?.valueDate || ''),
    time: String(f.TransactionTime?.valueTime || '').slice(0, 5),
    last4,
    method: /cash/.test(payment) ? 'cash' : last4 || /card|visa|master|amex|debit|credit/.test(payment) ? 'card' : '',
    lines,
    taxCents,
    totalCents: money(f.Total) ?? 0
  }, categories.map(c => c.id));
}

// `endpoint` is the resource's address from the Azure portal, e.g.
// https://my-saveup.cognitiveservices.azure.com/
export function azureReceiptReader({ endpoint, apiKey, fetchImpl = fetch, pause = wait, timeoutMs = 60_000 } = {}) {
  if (!endpoint || !apiKey) return null;
  let base;
  try { base = new URL(endpoint); } catch { return null; }
  if (base.protocol !== 'https:') return null;
  const root = base.origin;
  const headers = { 'Ocp-Apim-Subscription-Key': apiKey };
  return {
    async read({ imageBase64, categories = [] }) {
      const res = await fetchImpl(`${root}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=${API_VERSION}`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ base64Source: imageBase64 }),
        signal: AbortSignal.timeout(30_000)
      });
      if (res.status !== 202) {
        const data = await res.json().catch(() => ({}));
        throw new Error(`Azure ${res.status}: ${data.error?.message || 'request failed'}`);
      }
      // The key is only ever sent back to the same Azure resource.
      const poll = new URL(res.headers.get('operation-location') || '', root);
      if (poll.origin !== root) throw new Error('Azure answered from an unexpected address.');
      const deadline = Date.now() + timeoutMs;
      let delay = Math.min(5, Number(res.headers.get('retry-after')) || 1) * 1000;
      while (Date.now() < deadline) {
        await pause(delay);
        const r = await fetchImpl(poll.href, { headers, signal: AbortSignal.timeout(30_000) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`Azure ${r.status}: ${data.error?.message || 'request failed'}`);
        if (data.status === 'succeeded') return fromAzure(data.analyzeResult, categories);
        if (data.status === 'failed' || data.status === 'canceled') throw new Error(`Azure couldn't read the receipt: ${data.error?.message || data.status}`);
        delay = Math.min(5, Number(r.headers.get('retry-after')) || 1) * 1000;
      }
      throw new Error('Azure took too long to read the receipt.');
    }
  };
}
