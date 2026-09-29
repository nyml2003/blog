import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePort, candidatesFor, PORT_ATTEMPTS, PORT_MAX, PORT_MIN } from '@fluvient-cli/cli-kit/port-allocation.ts';
import { OpsError } from '@fluvient-cli/cli-kit/errors.ts';
import { planMode, exitCodeForSignal, withLogPrefix } from '../../src/runtime/runtime-plan.ts';

function probeWith(occupied: ReadonlySet<number>) {
  const seen: number[] = [];
  return {
    seen,
    probe: { isFree: async (port: number) => { seen.push(port); return !occupied.has(port); } },
  };
}

test('candidate window is bounded to ten ports and clamped to the range top', () => {
  assert.deepEqual(candidatesFor(8081), [8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090]);
  assert.equal(candidatesFor(8081).length, PORT_ATTEMPTS);
  assert.deepEqual(candidatesFor(PORT_MAX - 1), [PORT_MAX - 1, PORT_MAX]);
  assert.ok(PORT_MIN < PORT_MAX);
});

test('allocation retries upward from the candidate and reports the real bind result', async () => {
  const probe = probeWith(new Set([8081, 8082]));
  const allocation = await allocatePort({ service: 'data', candidate: 8081, probe: probe.probe });
  assert.deepEqual(allocation, { service: 'data', port: 8083, attempts: [8081, 8082, 8083] });
  assert.deepEqual(probe.seen, [8081, 8082, 8083]);
});

test('ports already handed out in the same run are excluded from later candidates', async () => {
  const probe = probeWith(new Set());
  const first = await allocatePort({ service: 'data', candidate: 8081, probe: probe.probe });
  const second = await allocatePort({ service: 'product', candidate: 8080, probe: probe.probe, excluded: new Set([first.port]) });
  assert.equal(first.port, 8081);
  assert.equal(second.port, 8080);
  assert.notEqual(first.port, second.port);

  const collision = await allocatePort({ service: 'mock', candidate: 9090, probe: probe.probe, excluded: new Set([9090]) });
  assert.equal(collision.port, 9091);
});

test('exhausting the window raises PORT_EXHAUSTED with every attempted port', async () => {
  const occupied = new Set([8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090]);
  const probe = probeWith(occupied);
  const failure = await allocatePort({ service: 'data', candidate: 8081, probe: probe.probe }).catch((error) => error) as OpsError;
  assert.ok(failure instanceof OpsError);
  assert.equal(failure.code, 'PORT_EXHAUSTED');
  assert.equal(failure.exitCode, 20);
  assert.deepEqual(failure.details.map((detail) => detail.port), [8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090]);
  assert.match(failure.message, /8090/);
});

test('mode plans fix the dependency order, data semantics and candidate ports', () => {
  assert.deepEqual(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }).services, ['mock', 'web']);
  assert.deepEqual(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }).candidates, { mock: 9090, web: 5173 });
  assert.deepEqual(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }).services, ['data', 'product']);
  assert.deepEqual(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }).services, ['data', 'product']);
  assert.equal(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }).entry, 'web');
  assert.equal(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }).entry, null);
  assert.equal(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }).entry, 'product');
  assert.equal(planMode({ mode: 'backend', dataMode: 'mock', productPort: 8080, dataPort: 8081 }).dataMode, 'mock');
  assert.equal(planMode({ mode: 'backend', dataMode: 'test', productPort: 8080, dataPort: 8081 }).dataMode, 'test');
  assert.equal(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }).dataMode, 'test');
  assert.deepEqual(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }).builds, []);
  assert.equal(planMode({ mode: 'integration', watch: false, productPort: 8080, dataPort: 8081 }).builds.length, 1);
  assert.equal(planMode({ mode: 'integration', watch: true, productPort: 8080, dataPort: 8081 }).watchBuild?.label, 'pnpm -C src/frontend run build --watch');
  assert.equal(planMode({ mode: 'dev', scenario: 'empty', webPort: 5173, mockPort: 9090 }).scenario, 'empty');
  assert.equal(planMode({ mode: 'dev', scenario: 'default', webPort: 5173, mockPort: 9090 }).scenario, 'default');
  assert.deepEqual(planMode({ mode: 'dev', scenario: 'default', webPort: 5273, mockPort: 9190 }).candidates, { mock: 9190, web: 5273 });
  assert.deepEqual(planMode({ mode: 'backend', dataMode: 'mock', productPort: 18080, dataPort: 18081 }).candidates, { data: 18081, product: 18080 });
});

test('forwarding adds a prefix only when the line does not already carry one', () => {
  // Rust services print their own prefix; ops must not double it.
  for (const role of ['web', 'product', 'data', 'mock', 'ops'] as const) {
    assert.equal(withLogPrefix('mock', `[${role}] already prefixed`), `[${role}] already prefixed`);
  }
  assert.equal(withLogPrefix('data', 'plain child line'), '[data] plain child line');
  assert.equal(withLogPrefix('ops', 'progress'), '[ops] progress');
  // A bracketed word without the trailing space is content, not a prefix.
  assert.equal(withLogPrefix('web', '[note] not a prefix'), '[web] [note] not a prefix');
  assert.equal(withLogPrefix('mock', '[mock]no space'), '[mock] [mock]no space');
});

test('signals map to 130 and 143', () => {
  assert.equal(exitCodeForSignal('SIGINT'), 130);
  assert.equal(exitCodeForSignal('SIGTERM'), 143);
});

test('runtime planning never repairs missing or invalid business input', () => {
  for (const input of [
    { mode: 'dev', scenario: 'default', webPort: 5173 },
    { mode: 'dev', scenario: 'unknown', webPort: 5173, mockPort: 9090 },
    { mode: 'backend', dataMode: 'unknown', productPort: 8080, dataPort: 8081 },
    { mode: 'integration', productPort: 8080, dataPort: 8081 },
    { mode: 'backend', dataMode: 'mock', productPort: 0, dataPort: 8081 },
  ]) {
    assert.throws(() => Reflect.apply(planMode, undefined, [input]), /invalid runtime/);
  }
});
