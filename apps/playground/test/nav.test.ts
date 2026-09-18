import assert from "node:assert/strict";
import test from "node:test";
import type { ResourceHandle } from "@fluvient-loom/common";
import type {
  NavigationPort,
  NavigationSnapshot,
} from "@fluvient-loom/port";
import { createDemoNavigator, type DemoView } from "../src/nav";

function fakeNavigation(): {
  readonly navigation: NavigationPort;
  readonly pushes: { href: string; state: unknown }[];
  readonly replaces: { href: string; state: unknown }[];
  /** Set the landing history state, then fire popstate. */
  readonly land: (state: unknown) => void;
} {
  const pushes: { href: string; state: unknown }[] = [];
  const replaces: { href: string; state: unknown }[] = [];
  const listeners = new Set<() => void>();
  let currentState: unknown = undefined;
  const navigation: NavigationPort = {
    current(): NavigationSnapshot {
      return { pathname: "/demo", search: "", state: currentState };
    },
    push(href, state) {
      pushes.push({ href, state });
      currentState = state;
    },
    replace(href, state) {
      replaces.push({ href, state });
      currentState = state;
    },
    back() {
      for (const listener of Array.from(listeners)) listener();
    },
    subscribePopState(listener): ResourceHandle {
      listeners.add(listener);
      return { release() {} };
    },
    subscribePageHide(): ResourceHandle {
      return { release() {} };
    },
  };
  return {
    navigation,
    pushes,
    replaces,
    land(state: unknown) {
      currentState = state;
      for (const listener of Array.from(listeners)) listener();
    },
  };
}

test("opening the sheet is pure UI: no history entry, view notifies", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  const seen: DemoView[] = [];
  navigator.subscribe((view) => seen.push(view));

  navigator.openList();
  assert.deepEqual(seen, [{ name: "list" }]);
  assert.deepEqual(fake.pushes, [], "the sheet never touches history");
  assert.deepEqual(navigator.currentBeneath(), { name: "home" });

  // Closing unwinds the view stack (still no history); reopening works.
  navigator.closeSheet();
  assert.deepEqual(navigator.current(), { name: "home" });
  assert.deepEqual(seen.at(-1), { name: "home" });
  navigator.openList();
  assert.deepEqual(navigator.current(), { name: "list" });
});

test("pushing a page stamps the landing entry with a full stack snapshot", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  navigator.openList();
  navigator.openDetail(5, "sheet");
  navigator.openDetail(7, "page");
  assert.deepEqual(fake.replaces.at(-1), {
    href: "/demo",
    state: { stack: ["home", "list", "sheet:5"] },
  });
  assert.deepEqual(fake.pushes.at(-1), { href: "/demo/articles/7", state: {} });
});

test("back rebuilds the stack from the landing snapshot: page chain", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  const seen: DemoView[] = [];
  navigator.subscribe((view) => seen.push(view));

  navigator.openDetail(1, "page");
  navigator.openDetail(2, "page");
  fake.land({ stack: ["home", "page:1"] });
  assert.deepEqual(navigator.current(), {
    name: "detail",
    id: 1,
    form: "page",
  });
  fake.land({ stack: ["home"] });
  assert.deepEqual(navigator.current(), { name: "home" });
});

test("back rebuilds the stack from the landing snapshot: sheet chain", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  navigator.openList();
  navigator.openDetail(5, "sheet");
  navigator.openDetail(7, "page");
  fake.land({ stack: ["home", "list", "sheet:5"] });
  assert.deepEqual(navigator.current(), {
    name: "detail",
    id: 5,
    form: "sheet",
  });
  assert.deepEqual(navigator.currentBeneath(), { name: "home" });
});

test("back onto a bare entry unwinds everything to home", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  navigator.openList();
  navigator.openDetail(3, "page");
  fake.land(undefined);
  assert.deepEqual(navigator.current(), { name: "home" });
});

test("currentBeneath returns the page a sheet covers", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  assert.deepEqual(navigator.currentBeneath(), { name: "home" });

  navigator.openList();
  assert.deepEqual(navigator.currentBeneath(), { name: "home" });
  assert.deepEqual(navigator.current(), { name: "list" });

  navigator.openDetail(3, "page");
  fake.land({ stack: ["home", "list"] });
  assert.deepEqual(navigator.current(), { name: "list" });
  assert.deepEqual(navigator.currentBeneath(), { name: "home" });
});

test("reading flow chains details; only exact re-taps are ignored", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  navigator.openDetail(1, "page");
  const before = fake.pushes.length;

  navigator.openDetail(1, "page");
  assert.equal(fake.pushes.length, before);

  navigator.openDetail(2, "page");
  assert.equal(fake.pushes.length, before + 1);
  assert.deepEqual(navigator.current(), {
    name: "detail",
    id: 2,
    form: "page",
  });
});

test("sheet-form detail is pure UI: no history entry", () => {
  const fake = fakeNavigation();
  const navigator = createDemoNavigator(fake.navigation);
  const seen: DemoView[] = [];
  navigator.subscribe((view) => seen.push(view));

  navigator.openList();
  navigator.openDetail(5, "sheet");
  assert.deepEqual(fake.pushes, [], "sheet-form detail never touches history");
  assert.deepEqual(seen.at(-1), { name: "detail", id: 5, form: "sheet" });

  navigator.closeSheet();
  assert.deepEqual(navigator.current(), { name: "list" });
});
