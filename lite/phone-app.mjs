// Permanent private address for the SaveUp phone app, using Tailscale.
// `tailscale serve` gives this PC an HTTPS address on your tailnet, such as
// https://my-pc.tail1234.ts.net, that only devices signed into your Tailscale
// account can reach. Unlike `npm run phone`, it doesn't expire or change, so
// the app installed on your phone's home screen keeps working.
import { spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.LITE_PORT || 4193);
const envFile = fileURLToPath(new URL('./.env.local', import.meta.url));
const exe = process.platform === 'win32' ? 'C:\\Program Files\\Tailscale\\tailscale.exe' : 'tailscale';
const run = args => spawnSync(existsSync(exe) ? exe : 'tailscale', args, { encoding: 'utf8' });
const fail = msg => { console.error(`\n${msg}\n`); process.exit(1); };

const status = run(['status', '--json']);
if (status.error) fail('Tailscale isn’t installed. Get it from tailscale.com/download, sign in, then run this again.');
let self;
try { self = JSON.parse(status.stdout); } catch { fail('Tailscale didn’t answer. Open the Tailscale app on this PC and sign in, then run this again.'); }
if (self.BackendState !== 'Running') fail('Tailscale isn’t signed in on this PC. Open the Tailscale app (system tray), sign in, then run this again.');
const host = String(self.Self?.DNSName || '').replace(/\.$/, '');
if (!host.endsWith('.ts.net')) fail('Turn on MagicDNS and HTTPS for your tailnet at login.tailscale.com/admin/dns, then run this again.');

// Point the private HTTPS address at the app. Tailnet only: this is `serve`, never `funnel`.
const serve = run(['serve', '--bg', `--https=443`, `http://127.0.0.1:${port}`]);
if (serve.status !== 0) fail(`tailscale serve failed:\n${serve.stderr || serve.stdout}\nIf it mentions HTTPS certificates, turn on HTTPS at login.tailscale.com/admin/dns.`);

// The app only answers requests addressed to hosts it knows.
const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
const line = `SAVEUP_PUBLIC_HOST=${host}`;
const added = !env.split(/\r?\n/).includes(line);
if (added) appendFileSync(envFile, `${env.endsWith('\n') || !env ? '' : '\n'}# Tailscale address for the phone app (added by npm run phone:app)\n${line}\n`);

console.log(`
SaveUp's permanent private address:
  https://${host}

${added ? 'Restart the app (stop npm start, run it again) so it accepts this address.\n\n' : ''}On your phone:
  1. Install Tailscale and sign in with the same account.
  2. Open https://${host} in Safari (iPhone) or Chrome (Android).
  3. iPhone: Share > Add to Home Screen. Android: menu > Install app.

Only devices signed into your Tailscale account can open it. To stop sharing: tailscale serve reset`);
