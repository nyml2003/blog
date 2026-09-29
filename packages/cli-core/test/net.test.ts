import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import { TcpPortProbe, TcpReadiness } from '../src/net.ts';

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

test('the probe confirms a port by actually binding it', async () => {
  const probe = new TcpPortProbe();
  const busy = await listen(0);
  const address = busy.address();
  assert.ok(address !== null && typeof address === 'object');
  const taken = address.port;
  assert.equal(await probe.isFree(taken), false, 'an occupied port is not a candidate');
  assert.equal(await probe.isFree(1), false, 'a privileged port is not a candidate');
  const free = 1024 + Math.floor(Math.random() * 20_000);
  assert.equal(await probe.isFree(free), true, 'an unbound port in range is a candidate');
  await new Promise<void>((resolve) => busy.close(() => resolve()));
});

test('readiness resolves only once the service accepts connections', async () => {
  const readiness = new TcpReadiness();
  const server = await listen(0);
  const port = (server.address() as { port: number }).port;
  assert.equal(await readiness.wait(port, { timeoutMs: 1000, intervalMs: 20 }), true);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('readiness reports the timeout instead of blocking forever', async () => {
  const readiness = new TcpReadiness();
  const started = Date.now();
  const ready = await readiness.wait(1024 + Math.floor(Math.random() * 20_000), { timeoutMs: 150, intervalMs: 30 });
  assert.equal(ready, false);
  assert.ok(Date.now() - started >= 140);
});

test('readiness stops retrying once the wait is cancelled', async () => {
  const readiness = new TcpReadiness();
  let cancelled = false;
  const timer = setTimeout(() => { cancelled = true; }, 80);
  const started = Date.now();
  const ready = await readiness.wait(1024 + Math.floor(Math.random() * 20_000), {
    timeoutMs: 5000,
    intervalMs: 20,
    isCancelled: () => cancelled,
  });
  clearTimeout(timer);
  assert.equal(ready, false);
  assert.ok(Date.now() - started < 1000);
});
