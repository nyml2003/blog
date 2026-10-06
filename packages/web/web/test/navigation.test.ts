import assert from "node:assert/strict";
import test from "node:test";
import { createWebNavigation } from "@fluvient-loom/web";

function fakeHost() {
  const calls: string[] = [];
  const listeners = new Map<string, Set<() => void>>();
  return {
    calls,
    history: {
      state: { frame: 7 },
      length: 2,
      pushState(state: unknown, _unused: string, href: string) {
        calls.push(`push ${href} ${JSON.stringify(state)}`);
      },
      replaceState(state: unknown, _unused: string, href: string) {
        calls.push(`replace ${href} ${JSON.stringify(state)}`);
      },
      back() {
        calls.push("back");
      },
    },
    location: {
      pathname: "/m/settings",
      search: "?x=1",
      origin: "https://blog.test",
      assign(href: string) {
        calls.push(`assign ${href}`);
      },
    },
    events: {
      addEventListener(type: string, listener: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
    },
    dispatch(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
}

test("web navigation snapshots current and forwards push/replace/back", () => {
  const host = fakeHost();
  const navigation = createWebNavigation({
    history: host.history,
    location: host.location,
    events: host.events,
  });
  assert.deepEqual(navigation.current(), {
    pathname: "/m/settings",
    search: "?x=1",
    state: { frame: 7 },
  });
  navigation.push("/m/articles", { frame: 8 });
  navigation.replace("/m/articles?cat=a", { frame: 9 });
  navigation.assign("/admin/index.html");
  navigation.back();
  assert.deepEqual(host.calls, [
    'push /m/articles {"frame":8}',
    'replace /m/articles?cat=a {"frame":9}',
    "assign /admin/index.html",
    "back",
  ]);
});

test("return-to-site primitives read history length, referrer and origin", () => {
  const host = fakeHost();
  const navigation = createWebNavigation({
    history: host.history,
    location: host.location,
    events: host.events,
    referrer: "https://blog.test/m/articles/",
  });
  assert.equal(navigation.canGoBack(), true);
  assert.equal(navigation.referrer(), "https://blog.test/m/articles/");
  assert.equal(navigation.origin(), "https://blog.test");

  const firstEntry = createWebNavigation({
    history: { ...host.history, length: 1 },
    location: host.location,
    events: host.events,
    referrer: "",
  });
  assert.equal(firstEntry.canGoBack(), false);
  assert.equal(firstEntry.referrer(), "");
});

test("popstate and pagehide subscriptions dispatch and release", () => {
  const host = fakeHost();
  const navigation = createWebNavigation({
    history: host.history,
    location: host.location,
    events: host.events,
  });
  let pops = 0;
  let hides = 0;
  const popHandle = navigation.subscribePopState(() => {
    pops += 1;
  });
  navigation.subscribePageHide(() => {
    hides += 1;
  });
  host.dispatch("popstate");
  host.dispatch("pagehide");
  assert.equal(pops, 1);
  assert.equal(hides, 1);

  popHandle.release();
  popHandle.release();
  host.dispatch("popstate");
  assert.equal(pops, 1);
  assert.equal(hides, 1);
});

test("constructing without browser globals fails eagerly", () => {
  assert.throws(() => createWebNavigation(), /history \/ location \/ window/);
});
