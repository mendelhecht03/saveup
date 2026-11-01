import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('missing or invalid URLs cannot crash the preview server or expose repository files', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited early (${code}): ${errors}`)));
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
  });

  for (const route of ['/missing.html', '/AGENTS.md', '/docs/product-spec.md', '/assets/', '/%FF']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    assert.equal(await response.text(), 'Not found');
  }
  assert.equal((await fetch(base + '/%2e%2e%2fpackage.json')).status, 403);
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /SaveUp/);
  assert.equal(errors, '');
});
