// npm run seed [-- --fresh]: asks the running app to add a new SaveUp Test Bank.
// It goes through the app (not Plaid directly) so the access token stays in the
// app's own data file. --fresh removes earlier test banks first.
const base = process.env.SAVEUP_URL || `http://127.0.0.1:${process.env.LITE_PORT || 4193}`;
const fresh = process.argv.includes('--fresh');

async function main() {
  let csrf;
  try { ({ csrf } = await (await fetch(`${base}/api/state`)).json()); } catch { console.log('Start the app first: npm start'); process.exitCode = 1; return; }
  console.log(fresh ? 'Replacing the test bank (this takes up to half a minute)…' : 'Adding a test bank (this takes up to half a minute)…');
  const res = await fetch(`${base}/api/sandbox/seed`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SaveUp-CSRF': csrf }, body: JSON.stringify({ fresh }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`Could not add the test bank: ${data.error || res.status}`); process.exitCode = 1; return; }
  const { items = [], txns = [], accounts = {} } = data.state || {};
  const bank = items.at(-1);
  const mine = txns.filter(t => t.itemId === bank?.id);
  console.log(`Added ${bank?.name}: ${Object.values(accounts).filter(a => a.itemId === bank?.id).length} accounts, ${mine.length} transactions (${mine.filter(t => t.pending).length} pending).`);
  if (bank?.error) console.log(`Plaid said: ${bank.error}. Try Sync in the app in a minute.`);
}
main();
