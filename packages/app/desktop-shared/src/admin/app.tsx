import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import type { PageFactory } from "@fluvient-loom/page-kit";
import { route, type DesktopPageContext } from "../context.ts";
import "./app.css";

export interface DesktopAdminView {
  readonly id: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly nav:
    | { readonly label: string; readonly order: number; readonly hidden?: boolean }
    | undefined;
  readonly load: () => Promise<PageFactory<DesktopPageContext>>;
}

export interface DesktopAdminAppOptions {
  readonly context: DesktopPageContext;
  readonly initialPageId: string;
  readonly views: readonly DesktopAdminView[];
}

const SIDEBAR_KEY = "blog.desktop.admin.sidebar.v1";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function persistCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // 隐私模式等存储不可用时只丢失折叠记忆，不影响导航。
  }
}

function FailedView() {
  return (
    <p role="alert" class="admin-view-failed">
      页面加载失败，请刷新或返回文章管理。
    </p>
  );
}

function MissingView() {
  return (
    <p role="alert" class="admin-view-failed">
      未知的管理端页面。
    </p>
  );
}

/**
 * 管理端 SPA 宿主：顶栏 + 可收起侧边栏 + 内容区。
 * 视图来自页面注册表（id/aliases/load），URL 仍是各页自己的路径：
 * 侧边栏与页面内链被拦截后走 History API 原地换视图，刷新与深链仍由
 * 每个路径对应的静态 HTML 接管（后端无需 SPA 回退）。
 */
export function createDesktopAdminApp(
  options: DesktopAdminAppOptions,
): Component {
  const byId = new Map(options.views.map((view) => [view.id, view]));
  const pathToId = new Map<string, string>();
  for (const view of options.views) {
    for (const alias of view.aliases) {
      pathToId.set(alias.split("?")[0] ?? alias, view.id);
    }
  }
  const cached = new Map<string, Promise<Component>>();
  const menu = options.views
    .filter((view) => view.nav !== undefined && view.nav.hidden !== true)
    .slice()
    .sort((left, right) => (left.nav?.order ?? 0) - (right.nav?.order ?? 0));

  function loadView(view: DesktopAdminView): Promise<Component> {
    const existing = cached.get(view.id);
    if (existing !== undefined) return existing;
    const pending = view
      .load()
      .then((factory) => factory(options.context));
    cached.set(view.id, pending);
    return pending;
  }

  return function DesktopAdminApp() {
    const [currentId, setCurrentId] = createSignal(options.initialPageId);
    const [collapsed, setCollapsed] = createSignal(readCollapsed());
    const [view, setView] = createSignal<Component>(MissingView);
    let loadToken = 0;

    const resolve = (pathname: string): string | undefined => pathToId.get(pathname);

    const current = () => byId.get(currentId());

    const navigate = (href: string, replace = false): void => {
      const url = new URL(href, window.location.origin);
      const id = resolve(url.pathname);
      if (id === undefined) {
        window.location.assign(href);
        return;
      }
      if (replace) window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
      setCurrentId(id);
    };

    createEffect(() => {
      const target = current();
      if (target === undefined) {
        setView(() => MissingView);
        return;
      }
      document.title = target.title;
      const token = ++loadToken;
      void loadView(target).then(
        (component) => {
          if (loadToken === token) setView(() => component);
        },
        () => {
          if (loadToken === token) setView(() => FailedView);
        },
      );
    });

    onMount(() => {
      const onPopState = (): void => {
        const id = resolve(window.location.pathname);
        if (id !== undefined) setCurrentId(id);
      };
      const onClick = (event: MouseEvent): void => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        const target = event.target;
        const anchor =
          target instanceof Element ? target.closest("a") : null;
        if (!(anchor instanceof HTMLAnchorElement)) return;
        if (anchor.target !== "" && anchor.target !== "_self") return;
        if (anchor.hasAttribute("download")) return;
        const href = anchor.getAttribute("href");
        if (href === null || href.startsWith("#")) return;
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (resolve(url.pathname) === undefined) return;
        event.preventDefault();
        navigate(`${url.pathname}${url.search}${url.hash}`);
      };
      window.addEventListener("popstate", onPopState);
      document.addEventListener("click", onClick);
      // 空闲预取视图 chunk：侧边栏切换不再等网络。
      const idle = window.setTimeout(() => {
        for (const view of options.views) void loadView(view);
      }, 1200);
      onCleanup(() => {
        window.clearTimeout(idle);
        window.removeEventListener("popstate", onPopState);
        document.removeEventListener("click", onClick);
      });
    });

    const toggleSidebar = (): void => {
      const next = !collapsed();
      setCollapsed(next);
      persistCollapsed(next);
    };

    return (
      <div class="admin-app">
        <a class="skip" href="#main">
          跳到主内容
        </a>
        <header class="admin-banner">
          <a
            class="admin-brand"
            href={route(options.context.routes, "desktop-admin-home")}
          >
            <span>管理台</span>
            <strong>技术知识库</strong>
          </a>
          <div class="admin-banner-actions">
            <a href={route(options.context.routes, "desktop-public-home")}>
              返回站点
            </a>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={!collapsed()}
              aria-controls="admin-sidebar"
            >
              {collapsed() ? "展开菜单" : "收起菜单"}
            </button>
          </div>
        </header>
        <div class="admin-body">
          <aside
            id="admin-sidebar"
            class="admin-sidebar"
            data-collapsed={collapsed() ? "true" : "false"}
          >
            <nav aria-label="管理台导航">
              <For each={menu}>
                {(item) => (
                  <a
                    class="admin-nav-link"
                    href={route(options.context.routes, item.id)}
                    aria-current={currentId() === item.id ? "page" : undefined}
                    onMouseEnter={() => void loadView(item)}
                    onFocus={() => void loadView(item)}
                  >
                    <span class="admin-nav-full">{item.nav?.label}</span>
                    <span class="admin-nav-short" aria-hidden="true">
                      {item.nav?.label.slice(0, 1)}
                    </span>
                  </a>
                )}
              </For>
            </nav>
          </aside>
          <main id="main" class="admin-content">
            <Dynamic component={view()} />
          </main>
        </div>
      </div>
    );
  };
}
