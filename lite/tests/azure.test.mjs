import test from 'node:test';
import assert from 'node:assert/strict';
import { fromAzure, azureReceiptReader } from '../receipts/azure.mjs';
import { pickReceiptReader } from '../server.mjs';
import { checkTotals } from '../receipts/reader.mjs';

const cur = amount => ({ type: 'currency', valueCurrency: { amount, currencyCode: 'USD' } });
const item = (Description, TotalPrice, extra = {}) => ({ type: 'object', valueObject: { Description: { type: 'string', valueString: Description }, ...(TotalPrice != null ? { TotalPrice: cur(TotalPrice) } : {}), ...extra } });
// Shaped like Azure's prebuilt-receipt answer (api-version 2024-11-30).
const RESULT = {
  content: 'KAHANS\nGV WHL MLK 3.49\nBANANAS 1.20\nTAX 0.28\nTOTAL 4.97\nVISA ************4821',
  documents: [{
    docType: 'receipt.retailMeal',
    fields: {
      MerchantName: { type: 'string', valueString: 'Kahans' },
      TransactionDate: { type: 'date', valueDate: '2026-11-03' },
      TransactionTime: { type: 'time', valueTime: '14:05:00' },
      Items: { type: 'array', valueArray: [
        item('GV WHL MLK', 3.49, { ProductCode: { type: 'string', valueString: '0078742' } }),
        item('BANANAS', null, { Quantity: { type: 'number', valueNumber: 2 }, Price: cur(0.6) })
      ] },
      TotalTax: cur(0.28),
      Total: cur(4.97),
      Payments: { type: 'array', valueArray: [{ type: 'object', valueObject: { Method: { type: 'string', valueString: 'Visa' } } }] }
    }
  }]
};

test('an Azure receipt becomes a SaveUp reading with every line left for the person to file', () => {
  const r = fromAzure(RESULT, [{ id: 'groceries', name: 'Groceries' }]);
  assert.equal(r.merchant, 'Kahans');
  assert.deepEqual([r.date, r.time, r.last4, r.method], ['2026-11-03', '14:05', '4821', 'card']);
  assert.deepEqual(r.lines.map(l => [l.code, l.name, l.amountCents, l.categoryId, l.unsure]), [
    ['0078742', 'GV WHL MLK', 349, '', true],
    ['BANANAS', 'BANANAS', 120, '', true]
  ], 'a line without a total uses price times quantity');
  assert.deepEqual([r.taxCents, r.totalCents], [28, 497]);
  assert.equal(checkTotals(r).ok, true);
});

test('the card’s last 4 is found however the receipt masks it, as Azure writes it', () => {
  for (const masked of ['VISA ···· 4417', 'VISA •••• 4417', 'CARD XXXXXXXXXXXX4417', 'MC **** 4417']) {
    const r = fromAzure({ content: `TOTAL 1.00\n${masked}\nAUTH 206310`, documents: [{ fields: {} }] });
    assert.deepEqual([r.last4, r.method], ['4417', 'card'], masked);
  }
});

test('an empty or odd Azure answer still gives a safe, empty reading', () => {
  const r = fromAzure({ documents: [] });
  assert.deepEqual([r.merchant, r.lines.length, r.totalCents, r.last4], ['', 0, 0, '']);
});

test('the Azure reader sends the photo, waits for the result, and only talks to its own resource', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (opts.method === 'POST') return new Response(null, { status: 202, headers: { 'operation-location': 'https://me.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-receipt/analyzeResults/abc?api-version=2024-11-30' } });
    const done = calls.length > 2;
    return Response.json(done ? { status: 'succeeded', analyzeResult: RESULT } : { status: 'running' });
  };
  const reader = azureReceiptReader({ endpoint: 'https://me.cognitiveservices.azure.com/', apiKey: 'k', fetchImpl, pause: async () => {} });
  const r = await reader.read({ imageBase64: 'AAAA', mediaType: 'image/png' });
  assert.equal(r.totalCents, 497);
  assert.match(calls[0].url, /^https:\/\/me\.cognitiveservices\.azure\.com\/documentintelligence\/documentModels\/prebuilt-receipt:analyze\?api-version=2024-11-30$/);
  assert.deepEqual(JSON.parse(calls[0].opts.body), { base64Source: 'AAAA' });
  assert.equal(calls[0].opts.headers['Ocp-Apim-Subscription-Key'], 'k');
  assert.equal(calls.length, 3, 'it polls until Azure says it is done');

  const evil = azureReceiptReader({ endpoint: 'https://me.cognitiveservices.azure.com', apiKey: 'k', pause: async () => {},
    fetchImpl: async () => new Response(null, { status: 202, headers: { 'operation-location': 'https://evil.example/steal' } }) });
  await assert.rejects(evil.read({ imageBase64: 'AAAA' }), /unexpected address/, 'the key is never sent elsewhere');

  const failing = azureReceiptReader({ endpoint: 'https://me.cognitiveservices.azure.com', apiKey: 'bad', fetchImpl: async () => Response.json({ error: { message: 'Access denied' } }, { status: 401 }) });
  await assert.rejects(failing.read({ imageBase64: 'AAAA' }), /Azure 401: Access denied/);
});

test('Azure needs an https endpoint and a key; it is picked when set unless Claude is chosen', () => {
  assert.equal(azureReceiptReader({ endpoint: 'http://me.cognitiveservices.azure.com', apiKey: 'k' }), null);
  assert.equal(azureReceiptReader({ endpoint: 'https://me.cognitiveservices.azure.com' }), null);
  const both = { AZURE_DOCINTEL_ENDPOINT: 'https://me.cognitiveservices.azure.com', AZURE_DOCINTEL_KEY: 'k', ANTHROPIC_API_KEY: 'a' };
  assert.equal(pickReceiptReader(both).readerName, 'Azure');
  assert.equal(pickReceiptReader({ ...both, SAVEUP_RECEIPT_READER: 'claude' }).readerName, 'Claude');
  assert.equal(pickReceiptReader({ ANTHROPIC_API_KEY: 'a' }).readerName, 'Claude');
  assert.deepEqual(pickReceiptReader({}), { readReceipt: null, readerName: '' });
});
