import assert from "node:assert/strict";
import test from "node:test";
import { createCancellationSource, err } from "@fluvient-loom/common";
import {
  createJsonRequester,
  type NetworkPort,
  type NetworkRequest,
} from "@fluvient-loom/port";

function recordingNetwork(): {
  readonly network: NetworkPort;
  readonly requests: NetworkRequest[];
} {
  const requests: NetworkRequest[] = [];
  return {
    requests,
    network: {
      async request(request: NetworkRequest) {
        requests.push(request);
        return err({ kind: "network", message: "unused" });
      },
    },
  };
}

const okSignal = () => createCancellationSource().signal;

test("get fills the boilerplate fields and forwards the call", async () => {
  const fake = recordingNetwork();
  const requester = createJsonRequester(fake.network);
  const signal = okSignal();
  await requester.get("/settings", { signal, timeoutMs: 500 });
  assert.deepEqual(fake.requests, [
    {
      path: "/settings",
      method: "GET",
      headers: {},
      body: undefined,
      timeoutMs: 500,
      signal,
    },
  ]);
});

test("post carries the JSON body and custom headers", async () => {
  const fake = recordingNetwork();
  const requester = createJsonRequester(fake.network);
  const signal = okSignal();
  await requester.post("/settings", { theme: "dark" }, {
    signal,
    headers: { "x-test": "1" },
  });
  assert.deepEqual(fake.requests, [
    {
      path: "/settings",
      method: "POST",
      headers: { "x-test": "1" },
      body: { theme: "dark" },
      timeoutMs: undefined,
      signal,
    },
  ]);
});

test("omitted options fall back to an idle signal and no timeout", async () => {
  const fake = recordingNetwork();
  const requester = createJsonRequester(fake.network);
  await requester.delete("/settings/1");
  const request = fake.requests[0];
  assert.equal(request.method, "DELETE");
  assert.equal(request.timeoutMs, undefined);
  assert.equal(request.signal.cancelled, false);
});

test("the port's Result passes through untouched", async () => {
  const failure = err({ kind: "timeout", message: "late" });
  const requester = createJsonRequester({
    request: async () => failure,
  } as NetworkPort);
  assert.equal(await requester.get("/x"), failure);
});
