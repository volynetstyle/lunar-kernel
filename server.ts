import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createLunarCalendar } from './src/api.ts';

export function createPhaseServer(calendar = createLunarCalendar(
  readFileSync(new URL('./data/phases-2001-2100.lph', import.meta.url)),
)) {
  return createServer((request, response) => {
    const send = (status: number, value: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(405, { error: 'Use GET' });
    }
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/health') return send(200, { status: 'ok', range: calendar.range });
      if (url.pathname !== '/phase') return send(404, { error: 'Not found' });
      if (url.searchParams.getAll('date').length > 1) return send(400, { error: 'Pass date once' });
      const result = calendar.at(url.searchParams.get('date') ?? Date.now());
      if (!result) return send(422, { error: 'Date outside table range', range: calendar.range });
      send(200, result);
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError) {
        return send(400, { error: error.message });
      }
      send(500, { error: 'Internal server error' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configuredPort = process.env.PORT ?? '3000';
  if (!/^\d+$/.test(configuredPort)) throw new RangeError('Invalid PORT');
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Invalid PORT');
  const server = createPhaseServer();
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    const address = server.address();
    if (address && typeof address !== 'string') console.log(`Lunar API listening on ${address.address}:${address.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close());
  }
}
