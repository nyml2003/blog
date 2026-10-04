import assert from "node:assert/strict";
import test from "node:test";
import { createWebViewport } from "@fluvient-loom/web";

test("web viewport delegates scroll reads and writes", () => {
  let scrolledTo: number | undefined;
  const port = createWebViewport({
    readScrollY: () => 42,
    scrollTo: (scrollY) => {
      scrolledTo = scrollY;
    },
  });
  assert.equal(port.scrollY(), 42);
  port.scrollTo(7);
  assert.equal(scrolledTo, 7);
});

test("web viewport requires injection when window is absent", () => {
  assert.throws(() => createWebViewport(), /须显式注入/);
});
