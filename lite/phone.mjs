// Private, expiring HTTPS link for the phone. Uses the authenticated proxy in phone-preview.mjs
// (secret link -> Secure cookie) in front of the loopback-only Lite server.
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPreview } from './phone-preview.mjs';

const upstreamPort = Number(process.env.LITE_PORT || 4193);
const ready = await fetch(`http://127.0.0.1:${upstreamPort}/api/state`).catch(() => null);
if (!ready?.ok) { console.error('Start the app first: npm run lite'); process.exit(1); }

const preview = createPreview({ upstreamPort });
await new Promise(resolve => preview.server.listen(4191, '127.0.0.1', resolve));
const binary = process.env.CLOUDFLARED_PATH || (process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'SaveUp', 'tools', 'cloudflared.exe') : 'cloudflared');
const tunnel = spawn(binary, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4191'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const stop = () => { tunnel.kill(); preview.server.close(); };
setTimeout(stop, preview.expiresAt - Date.now()).unref();
let output = '', announced = false;
const watch = async chunk => {
  output = (output + chunk).slice(-16000);
  const url = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (announced || !url) return;
  announced = true;
  preview.setOrigin(url[0]);
  const link = `${url[0]}/#key=${preview.accessKey}`;
  const qa = fileURLToPath(new URL('../qa/', import.meta.url));
  await mkdir(qa, { recursive: true });
  await writeFile(path.join(qa, 'lite-phone.json'), JSON.stringify({ link, expiresAt: new Date(preview.expiresAt).toISOString() }, null, 2));
  console.log(`\nOpen this on your phone (private, expires in 8 hours):\n${link}\n\nKeep this window and the app running. Ctrl+C stops access.`);
};
tunnel.stdout.on('data', c => watch(c).catch(stop));
tunnel.stderr.on('data', c => watch(c).catch(stop));
tunnel.on('error', e => { console.error(`Could not start cloudflared (${e.code}). Install it or set CLOUDFLARED_PATH.`); stop(); });
tunnel.on('exit', code => { if (!announced) console.error(`Tunnel stopped (${code}).`); stop(); });
for (const s of ['SIGINT', 'SIGTERM']) process.once(s, stop);
