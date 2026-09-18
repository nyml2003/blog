import type { NavigationPort } from "@fluvient-loom/port";
import { log } from "./log";

export type DemoView =
  | { readonly name: "home" }
  | { readonly name: "list" }
  | {
      readonly name: "detail";
      readonly id: number;
      /** Presentation decided by the origin slot: from home it is a full
       * page (a real navigation); from the list sheet it is a sheet too
       * (pure UI, like the list itself). */
      readonly form: "page" | "sheet";
    };

export interface DemoNavigator {
  readonly current: () => DemoView;
  /**
   * The nearest non-sheet view in the stack — the page a sheet covers.
   * Sheets stay rendered-and-dimmed beneath, so the full-screen layer
   * below must remain visible while a sheet is on top.
   */
  readonly currentBeneath: () => DemoView;
  openList(): void;
  /** Closes the sheet at the view level too (pure UI, no history). */
  closeSheet(): void;
  openDetail(id: number, form: "page" | "sheet"): void;
  subscribe(listener: (view: DemoView) => void): () => void;
}

/**
 * Hand-rolled mini view stack over NavigationPort. The sheet is page UI,
 * not a navigation: opening/closing it never touches history. Pushing a
 * page from atop the sheet marks the history entry ("sheet: true") so a
 * later back lands on home-with-sheet instead of bare home.
 */
export function createDemoNavigator(
  navigation: NavigationPort,
): DemoNavigator {
  const stack: DemoView[] = [{ name: "home" }];
  const listeners = new Set<(view: DemoView) => void>();
  const notify = () => {
    const top = stack[stack.length - 1];
    for (const listener of Array.from(listeners)) listener(top);
  };
  const hrefOf = (view: DemoView): string =>
    view.name === "detail"
      ? `/demo/articles/${view.id}`
      : view.name === "list"
        ? "/demo/list"
        : "/";
  // Serializable view identity — history entries carry whole snapshots.
  const describe = (view: DemoView): string =>
    view.name === "home"
      ? "home"
      : view.name === "list"
        ? "list"
        : `${view.form}:${view.id}`;
  const parse = (token: string): DemoView | undefined => {
    if (token === "home") return { name: "home" };
    if (token === "list") return { name: "list" };
    const match = /^(page|sheet):(\d+)$/.exec(token);
    if (match === null) return undefined;
    return {
      name: "detail",
      id: Number(match[2]),
      form: match[1] as "page" | "sheet",
    };
  };
  const currentHref = () => {
    const snapshot = navigation.current();
    return snapshot.pathname + snapshot.search;
  };
  const push = (view: DemoView) => {
    log("nav", "push", view);
    // Before pushing a real page, stamp the current entry (the future
    // landing point) with the full view-stack snapshot, so back restores
    // exactly this world — pages and sheets alike.
    navigation.replace(currentHref(), { stack: stack.map(describe) });
    log("nav", "landing snapshot stamped", stack.map(describe));
    stack.push(view);
    navigation.push(hrefOf(view), {});
    notify();
  };

  navigation.subscribePopState(() => {
    const landing = navigation.current().state as
      | { stack?: readonly string[] }
      | undefined;
    const snapshot = landing?.stack;
    if (snapshot === undefined || snapshot.length === 0) {
      stack.length = 0;
      stack.push({ name: "home" });
      notify();
      return;
    }
    log("nav", "pop → rebuild from snapshot", snapshot);
    const rebuilt = snapshot
      .map(parse)
      .filter((view): view is DemoView => view !== undefined);
    if (rebuilt.length === 0) return;
    stack.length = 0;
    stack.push(...rebuilt);
    notify();
  });

  return {
    current: () => stack[stack.length - 1],
    currentBeneath: () => {
      const lastSheet = stack.map((view) => view.name).lastIndexOf("list");
      if (lastSheet === -1) return stack[stack.length - 1];
      for (let index = lastSheet - 1; index >= 0; index -= 1) {
        if (stack[index].name !== "list") return stack[index];
      }
      return stack[0];
    },
    openList: () => {
      log("nav", "openList (pure UI, no history)");
      if (stack[stack.length - 1].name === "list") return;
      stack.push({ name: "list" });
      notify();
    },
    closeSheet: () => {
      log("nav", "closeSheet (pure UI, no history)");
      const top = stack[stack.length - 1];
      const isSheetForm =
        top.name === "list" ||
        (top.name === "detail" && top.form === "sheet");
      if (!isSheetForm) return;
      stack.pop();
      notify();
    },
    openDetail: (id, form) => {
      const top = stack[stack.length - 1];
      if (
        top.name === "detail" &&
        top.id === id &&
        top.form === form
      ) {
        // Re-tapping the same article in the same form is a no-op;
        // anything else is a reading-flow step and pushes normally.
        return;
      }
      const view: DemoView = { name: "detail", id, form };
      if (form === "page") {
        push(view);
      } else {
        // A sheet-form detail is page UI like the list sheet: no history.
        stack.push(view);
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
