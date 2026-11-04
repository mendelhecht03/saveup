// Compares receipt readers on the sample images in sandbox/receipts/*.png
// against the true data in sandbox/receipts.mjs. From lite/: node receipts/compare.mjs
// Claude runs if ANTHROPIC_API_KEY is set (env or lite/.env.local); Tesseract runs
// if `tesseract` is on PATH. Nothing is installed or saved.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RECEIPTS } from '../sandbox/receipts.mjs';
import { claudeReceiptReader, checkTotals } from './reader.mjs';
import { veryfiReceiptReader } from './veryfi.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const norm = s => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();

// Share of true lines read with exactly the right code and amount (each read line used once).
export function scoreLines(truth, lines) {
  const pool = lines.map(l => `${norm(l.code)}|${l.amountCents}`);
  let hit = 0;
  for (const t of truth) {
    const i = pool.indexOf(`${norm(t.code)}|${t.amountCents}`);
    if (i >= 0) { hit++; pool.splice(i, 1); }
  }
  return { hit, of: truth.length };
}

// Turns Tesseract's plain text into item lines plus tax and total.
export function parseOcrText(text) {
  const lines = []; let taxCents = 0, totalCents = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(/^(.*?\S)\s+(-?)\$?\s?(\d{1,6})[.,](\d{2})$/);
    if (!m) continue;
    const label = m[1].trim(), amountCents = (m[2] ? -1 : 1) * (Number(m[3]) * 100 + Number(m[4]));
    if (/SUBTOTAL/i.test(label)) continue;
    if (/\bTAX\b/i.test(label)) { taxCents = amountCents; continue; }
    if (/\bTOTAL\b/i.test(label)) { totalCents = amountCents; continue; }
    if (/VISA|MASTERCARD|AMEX|DEBIT|CASH|CHANGE|[•*]{3,}/i.test(label)) continue;
    lines.push({ code: label, amountCents });
  }
  return { lines, taxCents, totalCents };
}

function hasTesseract() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['tesseract'], { encoding: 'utf8' });
  return r.status === 0;
}

function runTesseract(file) {
  const r = spawnSync('tesseract', [file, 'stdout', '--psm', '6'], { encoding: 'utf8', maxBuffer: 4 << 20 });
  if (r.status !== 0) throw new Error(`tesseract failed: ${(r.stderr || '').trim().split('\n').pop()}`);
  return parseOcrText(r.stdout);
}

async function main() {
  try { process.loadEnvFile(here('../.env.local')); } catch { /* optional */ }
  const readers = [];
  const claude = claudeReceiptReader({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.RECEIPT_MODEL || undefined });
  const categories = [...new Set(RECEIPTS.flatMap(r => r.items.map(i => i.category)))].map(c => ({ id: c, name: c, description: '' }));
  if (claude) readers.push({ name: 'Claude', read: file => claude.read({ imageBase64: readFileSync(file).toString('base64'), mediaType: 'image/png', categories }) });
  else console.log('Claude: skipped (no ANTHROPIC_API_KEY in the environment or lite/.env.local).');
  const veryfi = veryfiReceiptReader({ clientId: process.env.VERYFI_CLIENT_ID, apiKey: process.env.VERYFI_API_KEY, username: process.env.VERYFI_USERNAME || undefined });
  if (veryfi) readers.push({ name: 'Veryfi', read: file => veryfi.read({ imageBase64: readFileSync(file).toString('base64'), mediaType: 'image/png', categories }) });
  else console.log('Veryfi: skipped (no VERYFI_CLIENT_ID and VERYFI_API_KEY in lite/.env.local).');
  if (hasTesseract()) readers.push({ name: 'Tesseract', read: async file => runTesseract(file) });
  else console.log('Tesseract: skipped (`tesseract` is not on PATH).');
  if (!readers.length) { console.log('No receipt reader available, nothing to compare.'); return; }

  const rows = [['Reader', 'Receipt', 'Lines exact', 'Total right', 'Lines add up', 'Seconds']];
  for (const r of RECEIPTS) {
    const file = here(`../sandbox/receipts/${r.id}.png`);
    if (!existsSync(file)) { console.log(`Missing ${file}; run sandbox/receipts/render-samples.ps1 first.`); continue; }
    for (const reader of readers) {
      const start = performance.now();
      try {
        const got = await reader.read(file);
        const secs = ((performance.now() - start) / 1000).toFixed(1);
        const { hit, of } = scoreLines(r.items, got.lines);
        rows.push([reader.name, r.id, `${hit}/${of} (${Math.round((100 * hit) / of)}%)`, got.totalCents === r.totalCents ? 'yes' : `no (${got.totalCents})`, checkTotals(got).ok ? 'yes' : 'no', secs]);
      } catch (e) {
        rows.push([reader.name, r.id, `error: ${e.message.slice(0, 50)}`, '', '', ((performance.now() - start) / 1000).toFixed(1)]);
      }
    }
  }
  const widths = rows[0].map((_, c) => Math.max(...rows.map(row => String(row[c]).length)));
  for (const row of rows) console.log(row.map((v, c) => String(v).padEnd(widths[c])).join('  '));
}

if (import.meta.main) await main();
