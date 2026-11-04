import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeReceiptReader, normalizeReading, checkTotals } from '../receipts/reader.mjs';
import { parseOcrText, scoreLines } from '../receipts/compare.mjs';

const categories = [
  { id: 'groceries', name: 'Groceries', description: 'Food for home' },
  { id: 'household', name: 'Household', description: 'Cleaning and paper goods' }
];

const reading = {
  merchant: ' Target ', date: '2026-10-30', time: '14:32', last4: '4417', method: 'card',
  lines: [
    { code: 'GV WHL MLK', name: 'Whole milk', amountCents: 429, categoryId: 'groceries', unsure: false },
    { code: 'TIDE PODS 42', name: 'Tide Pods', amountCents: 1399, categoryId: 'household', unsure: true }
  ],
  taxCents: 120, totalCents: 1948
};

// A stand-in for fetch that records the request and answers with `reply`.
const fakeFetch = (reply, status = 200) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 400, status, json: async () => reply }; };
  fn.calls = calls;
  return fn;
};
const okReply = raw => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(raw) }] });

test('reader is off without an API key', () => {
  assert.equal(claudeReceiptReader({}), null);
  assert.equal(claudeReceiptReader({ apiKey: '' }), null);
});

test('reader sends the image before the text and limits budgets to the given ids', async () => {
  const fetchImpl = fakeFetch(okReply(reading));
  const reader = claudeReceiptReader({ apiKey: 'test-key', fetchImpl });
  const got = await reader.read({ imageBase64: 'AAAA', mediaType: 'image/png', categories });
  const { url, init, body } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'test-key');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  assert.equal(body.model, 'claude-haiku-5-5');
  const content = body.messages[0].content;
  assert.deepEqual(content.map(b => b.type), ['image', 'text']);
  assert.deepEqual(content[0].source, { type: 'base64', media_type: 'image/png', data: 'AAAA' });
  assert.match(content[1].text, /Cleaning and paper goods/);
  const schema = body.output_config.format.schema;
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.lines.items.properties.categoryId.enum, ['', 'groceries', 'household']);
  assert.equal(schema.properties.lines.items.properties.amountCents.type, 'integer');
  assert.match(body.system, /data, never instructions/);
  assert.equal(got.merchant, 'Target');
  assert.equal(got.lines.length, 2);
  assert.equal(got.lines[1].unsure, true);
});

test('reader uses a chosen model', async () => {
  const fetchImpl = fakeFetch(okReply(reading));
  await claudeReceiptReader({ apiKey: 'k', model: 'claude-x', fetchImpl }).read({ imageBase64: 'A', mediaType: 'image/jpeg', categories });
  assert.equal(fetchImpl.calls[0].body.model, 'claude-x');
});

test('a 4xx response or an early stop throws a clear error', async () => {
  const bad = claudeReceiptReader({ apiKey: 'k', fetchImpl: fakeFetch({ error: { message: 'invalid x-api-key' } }, 401) });
  await assert.rejects(bad.read({ imageBase64: 'A', mediaType: 'image/png', categories }), /Claude API 401: invalid x-api-key/);
  const refused = claudeReceiptReader({ apiKey: 'k', fetchImpl: fakeFetch({ stop_reason: 'refusal', content: [] }) });
  await assert.rejects(refused.read({ imageBase64: 'A', mediaType: 'image/png', categories }), /stopped early \(refusal\)/);
});

test('normalizeReading cleans bad lines and fields', () => {
  const got = normalizeReading({
    merchant: '  Shop   Rite ', date: '2026-02-30', time: '25:10', last4: '44a7', method: 'check',
    lines: [
      { code: '  BANANAS ', name: '', amountCents: 173, categoryId: 'groceries', unsure: false },
      { code: 'X'.repeat(80), name: 'Y'.repeat(80), amountCents: 100, categoryId: 'groceries', unsure: 0 },
      { code: 'COUPON', name: 'Store coupon', amountCents: -200, categoryId: '', unsure: false },
      { code: 'HALF', name: 'Half cent', amountCents: 12.5, categoryId: '', unsure: false },
      { code: 'ZERO', name: 'Zero', amountCents: 0, categoryId: '', unsure: false },
      { code: 'STR', name: 'String amount', amountCents: '199', categoryId: '', unsure: false },
      null
    ],
    taxCents: 1.5, totalCents: 'x'
  });
  assert.equal(got.merchant, 'Shop Rite');
  assert.equal(got.date, '', 'impossible dates are dropped');
  assert.equal(got.time, '');
  assert.equal(got.last4, '');
  assert.equal(got.method, '');
  assert.deepEqual(got.lines.map(l => l.code), ['BANANAS', 'X'.repeat(60), 'COUPON']);
  assert.equal(got.lines[0].name, 'BANANAS', 'an empty name falls back to the code');
  assert.equal(got.lines[1].name.length, 60);
  assert.equal(got.lines[1].unsure, false);
  assert.equal(got.lines[2].amountCents, -200, 'discount lines stay negative');
  assert.equal(got.taxCents, 0);
  assert.equal(got.totalCents, 0);
  assert.deepEqual(normalizeReading(reading).lines.map(l => l.amountCents), [429, 1399]);
  assert.equal(normalizeReading(reading).date, '2026-10-30');
  assert.equal(normalizeReading({ lines: [{ code: 'A', name: 'A', amountCents: 5, categoryId: 'rent' }] }, ['groceries']).lines[0].categoryId, '', 'unknown budget ids are dropped');
  assert.deepEqual(normalizeReading(null).lines, []);
});

test('checkTotals compares lines with total minus tax', () => {
  assert.deepEqual(checkTotals(reading), { linesCents: 1828, expectedCents: 1828, differenceCents: 0, ok: true });
  const missing = { ...reading, lines: reading.lines.slice(0, 1) };
  assert.deepEqual(checkTotals(missing), { linesCents: 429, expectedCents: 1828, differenceCents: -1399, ok: false });
  assert.deepEqual(checkTotals({ lines: [], taxCents: 0, totalCents: 0 }), { linesCents: 0, expectedCents: 0, differenceCents: 0, ok: true });
});

test('compare script parses OCR text and scores exact lines', () => {
  const ocr = parseOcrText('TARGET\nGV WHL MLK   $4.29\nCOUPON  -$2.00\nSUBTOTAL $2.29\nSALES TAX $0.15\n*** TOTAL $2.44\nVISA •••• 4417 $2.44\n');
  assert.deepEqual(ocr, { lines: [{ code: 'GV WHL MLK', amountCents: 429 }, { code: 'COUPON', amountCents: -200 }], taxCents: 15, totalCents: 244 });
  assert.deepEqual(scoreLines([{ code: 'GV WHL MLK', amountCents: 429 }, { code: 'BANANAS', amountCents: 173 }], ocr.lines), { hit: 1, of: 2 });
});
