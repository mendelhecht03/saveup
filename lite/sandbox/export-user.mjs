// Writes the SaveUp Test Bank as a Plaid Sandbox custom-user configuration, ready
// to paste into the Plaid Dashboard (Sandbox users). Then the bank is connected the
// real way, through the Plaid Link window, by logging in as that user.
//   npm run seed:export
// roll_dates_forward makes Plaid move every date up to the day the bank is
// connected, so pasting once is enough. The file goes in qa/, which Git ignores.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { todayISO } from '../public/logic.mjs';
import { customUser, allTransactions, ACCOUNTS } from './banks.mjs';

const today = todayISO();
const config = { roll_dates_forward: true, ...customUser(today) };
const dir = fileURLToPath(new URL('../../qa/', import.meta.url));
const file = path.join(dir, 'plaid-sandbox-user.json');
await mkdir(dir, { recursive: true });
await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);

const pending = allTransactions().filter(t => (t.posts ?? t.day) > 0).length;
console.log(`Wrote the SaveUp Test Bank for Plaid's dashboard:
  ${file}

${Object.keys(ACCOUNTS).length} accounts, ${allTransactions().length} transactions (${pending} still pending), dated up to ${today}.

1. Plaid Dashboard > Build > Sandbox (Sandbox Studio) > Users tab.
2. Username: saveup_test. Configuration: edit as JSON and paste this whole file.
3. SaveUp > More > Accounts > Connect a bank with Plaid. Pick First Platypus Bank,
   log in as saveup_test with any password.
Dates move forward to the day you connect, so you only paste this once.`);
