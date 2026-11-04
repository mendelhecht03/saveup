// Writes the sample receipts (sandbox/receipts.mjs) to JSON so the PowerShell
// renderer can draw them. Dates are computed from `day` relative to a fixed date
// so the images never change. Usage: node sandbox/receipts/export-samples.mjs [out.json]
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RECEIPTS, subtotalCents } from '../receipts.mjs';

export const SAMPLE_BASE_DATE = '2026-11-03';

export function receiptDate(day, base = SAMPLE_BASE_DATE) {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

if (import.meta.main) {
  const out = process.argv[2] || join(tmpdir(), 'saveup-receipts.json');
  const data = RECEIPTS.map(r => ({ ...r, date: receiptDate(r.day), subtotalCents: subtotalCents(r) }));
  writeFileSync(out, JSON.stringify(data, null, 2));
  console.log(out);
}
