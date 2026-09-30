import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureOutputPort } from '../src/output.ts';

test('OutputPort captures typed log, result and telemetry events', () => {
  const output = new CaptureOutputPort();
  output.log({ level: 'error', source: 'ops', channel: 'stderr', message: { key: 'child_exit', params: { role: 'product' } }, data: { exitCode: 1 } });
  output.result({ status: 'failure', command: 'runtime backend', exitCode: 20, code: 'CHILD_EXITED' });
  output.telemetry({ name: 'command.finished', data: { ok: false, exitCode: 20 } });
  assert.deepEqual(output.events.map((event) => event.kind), ['log', 'result', 'telemetry']);
  assert.equal(output.events[1]?.kind === 'result' && output.events[1].code, 'CHILD_EXITED');
});
