import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createLunarCalendar } from '../dist/lunar.js';

const data = await readFile(new URL('../dist/data/phases-2001-2100.lph', import.meta.url));
const lunar = createLunarCalendar(data);
assert.equal(lunar.at('2026-11-11T12:00:00Z').phase, 'waxing-crescent');
assert.deepEqual(data, await readFile(new URL('../data/phases-2001-2100.lph', import.meta.url)));

const server = spawn(process.execPath, ['dist/server.js'], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(server, 'exit');
let stderr = '';
server.stderr.setEncoding('utf8');
server.stderr.on('data', chunk => { stderr += chunk; });
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 10000);
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`Server exited ${code}: ${stderr}`)));
    server.stdout.setEncoding('utf8');
    let output = '';
    server.stdout.on('data', chunk => {
      output += chunk;
      const match = /Lunar API listening on 127\.0\.0\.1:(\d+)/.exec(output);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/phase?date=2026-11-11T12:00:00Z`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), lunar.at('2026-11-11T12:00:00Z'));
  console.log('Production bundle and HTTP server passed smoke tests.');
} finally {
  server.kill();
  await exited;
}
