// Reads receipt photos with Claude. Raw fetch keeps the app dependency-free, like plaid.mjs.
export class ReceiptError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export const RECEIPT_MODEL = 'claude-opus-5-5';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 7 * 1024 * 1024;

const instructions = `You transcribe store receipts for a personal budgeting app. Accuracy matters more than anything: the user will compare your result with their bank charge to the cent.
- merchant: the store or business name as a person would say it (e.g. "Target", not "TARGET T-1234").
- date: the purchase date as YYYY-MM-DD, or "" if it is not printed or not legible.
- items: every purchased line in printed order. amount_cents is the line total in integer cents after quantity (3 @ $1.25 is 375). printed is the line text exactly as it appears; name is a short readable name (expand obvious abbreviations such as "GV WHL MLK" to "Great Value whole milk"; keep the printed text if you are unsure).
- Discounts, coupons and savings are their own items with a negative amount_cents. Fees, deposits and bag charges are items too.
- tax_cents and tip_cents are totals for the receipt (0 if none). total_cents is the final amount charged, excluding cash back and change.
- Never invent or "fix" numbers to make them add up. If items + tax + tip do not equal the total, or anything is blurry, cut off or ambiguous, say so in notes.
- If the image is not a receipt, set is_receipt to false and leave the other fields empty or 0.`;

const schema = {
  type: 'object', additionalProperties: false,
  required: ['is_receipt', 'merchant', 'date', 'items', 'tax_cents', 'tip_cents', 'total_cents', 'notes'],
  properties: {
    is_receipt: { type: 'boolean' }, merchant: { type: 'string' }, date: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'printed', 'amount_cents'],
      properties: { name: { type: 'string' }, printed: { type: 'string' }, amount_cents: { type: 'integer' } } } },
    tax_cents: { type: 'integer' }, tip_cents: { type: 'integer' }, total_cents: { type: 'integer' }, notes: { type: 'string' }
  }
};

const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const int = value => Number.isSafeInteger(value) ? value : 0;
// The model's answer is untrusted input: keep only well-formed fields.
export function normalizeParse(raw) {
  if (!raw || typeof raw !== 'object' || raw.is_receipt !== true) throw new ReceiptError('That photo does not look like a receipt. Try again with the whole receipt in view.', 422);
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 200).map(item => ({
    name: text(item?.name, 200) || text(item?.printed, 200) || 'Item', printed: text(item?.printed, 200), amountCents: int(item?.amount_cents)
  }));
  return { merchant: text(raw.merchant, 200), date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : '', items,
    taxCents: Math.max(0, int(raw.tax_cents)), tipCents: Math.max(0, int(raw.tip_cents)), totalCents: Math.max(0, int(raw.total_cents)), notes: text(raw.notes, 1000) };
}

export function receiptReader({ apiKey, fetchImpl = fetch }) {
  const configured = Boolean(apiKey);
  async function read(base64, mediaType) {
    if (!configured) throw new ReceiptError('Receipt reading is not set up yet. Add ANTHROPIC_API_KEY to mvp/.env.local, then restart the app.', 503);
    if (!IMAGE_TYPES.has(mediaType)) throw new ReceiptError('Use a JPEG, PNG or WebP photo.', 415);
    let response;
    try {
      response = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(110000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
        body: JSON.stringify({
          model: RECEIPT_MODEL, max_tokens: 16000, fallbacks: 'default', system: instructions,
          output_config: { effort: 'high', format: { type: 'json_schema', schema } },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'Transcribe this receipt.' }
          ] }]
        })
      });
    } catch { throw new ReceiptError('Could not reach the receipt reader. Check your internet connection and try again.'); }
    let data;
    try { data = await response.json(); } catch { throw new ReceiptError('The receipt reader sent an unreadable answer. Try again.'); }
    if (!response.ok) {
      if (response.status === 401) throw new ReceiptError('The receipt reader rejected the API key. Check ANTHROPIC_API_KEY in mvp/.env.local.', 503);
      if (response.status === 429) throw new ReceiptError('The receipt reader is busy. Wait a moment and try again.', 503);
      throw new ReceiptError('The receipt reader could not process that photo. Try again.');
    }
    if (data.stop_reason === 'refusal') throw new ReceiptError('The receipt reader declined this photo. Enter the details by hand instead.', 422);
    if (data.stop_reason === 'max_tokens') throw new ReceiptError('That receipt was too long to read in one pass. Enter the details by hand instead.', 422);
    const answer = (data.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
    let parsed;
    try { parsed = JSON.parse(answer); } catch { throw new ReceiptError('The receipt reader sent an unreadable answer. Try again.'); }
    return normalizeParse(parsed);
  }
  return { configured, model: RECEIPT_MODEL, read };
}
