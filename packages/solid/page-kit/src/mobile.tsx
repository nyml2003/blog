import {
  asAsyncPersistence,
  type AsyncPersistencePort,
  type DocumentPort,
  type NavigationPort,
  type OperationIdPort,
  type PersistencePort,
  type SchedulerPort,
  type SpaceTimePort,
  type ViewportPort,
} from "@fluvient-loom/port";
import { createFetchNetwork } from "@fluvient-loom/net";
import {
  createWebDocument,
  createWebNavigation,
  createWebOperationId,
  createWebPersistence,
  createWebScheduler,
  createWebSpaceTime,
  createWebViewport,
} from "@fluvient-loom/web";
import { type Component, createComponent } from "solid-js";
import { render } from "solid-js/web";
import { PAGE_MOUNT_ELEMENT_ID, requireMountTarget } from "./mount.ts";
import type { PageView } from "./shared.ts";

// Mobile 浏览器端口装配：宿主适配器（@fluvient-loom/web 等）只允许在
// page-kit 内装配（SPEC-ARCH-BOUNDARY-001）；bootstrap 只组合应用声明
// （api 工厂、内嵌路由清单、页面工厂）并调用本包。
export interface WebMobilePorts {
  readonly network: ReturnType<typeof createFetchNetwork>;
  readonly navigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly asyncPersistence: AsyncPersistencePort;
  readonly operationId: OperationIdPort;
  readonly scheduler: SchedulerPort;
  readonly spaceTime: SpaceTimePort;
  readonly document: DocumentPort;
  readonly viewport: ViewportPort;
  readonly share: (url: string) => Promise<void>;
}

export function createWebMobilePorts(): WebMobilePorts {
  const network = createFetchNetwork({
    fetcher: window.fetch.bind(window),
    setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
  });
  const navigation = createWebNavigation({
    history: window.history,
    location: window.location,
    events: window,
  });
  const persistence = createWebPersistence({
    storage: window.localStorage,
  });
  const share = async (url: string): Promise<void> => {
    if (navigator.share) {
      await navigator.share({ url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
  };
  return {
    network,
    navigation,
    persistence,
    asyncPersistence: asAsyncPersistence(persistence),
    operationId: createWebOperationId(),
    scheduler: createWebScheduler({
      queueMicrotaskFn: (callback) => window.queueMicrotask(callback),
      setTimeoutFn: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeoutFn: (handle) => window.clearTimeout(handle as number),
      requestAnimationFrameFn: (callback) =>
        window.requestAnimationFrame(callback),
      cancelAnimationFrameFn: (handle) =>
        window.cancelAnimationFrame(handle as number),
    }),
    spaceTime: createWebSpaceTime({ now: () => Date.now() }),
    document: createWebDocument({ root: window.document.documentElement }),
    viewport: createWebViewport({
      readScrollY: () => window.scrollY,
      scrollTo: (scrollY) =>
        window.scrollTo({ top: scrollY, behavior: "auto" }),
    }),
    share,
  };
}

function MobileStartupError() {
  return (
    <main>
      <p role="alert">页面初始化失败，请重试。</p>
      <button type="button" onClick={() => window.location.reload()}>
        重试
      </button>
    </main>
  );
}

export interface MountApplicationOptions<Ctx> {
  readonly context:
    | { readonly ok: true; readonly value: Ctx }
    | { readonly ok: false; readonly error: unknown };
  readonly createPage: (context: Ctx) => PageView;
  /** context 创建失败时的附加清理（如移除 app shell）。 */
  readonly onContextFailure?: () => void;
  /** 挂载成功后的增强动作（如注册预取；失败不阻塞页面）。 */
  readonly afterMount?: () => void;
}

export function mountMobileApplication<Ctx>(
  options: MountApplicationOptions<Ctx>,
): void {
  const mount = requireMountTarget(document);
  if (!options.context.ok) {
    options.onContextFailure?.();
    render(() => createComponent(MobileStartupError, {}), mount);
    return;
  }
  const Page = options.createPage(options.context.value) as Component;
  render(() => createComponent(Page, {}), mount);
  options.afterMount?.();
}

/** 骨架撤除兜底时限：后台标签页的 rAF 会被暂停，超时后直接删壳避免骨架滞留。 */
const APP_SHELL_REVEAL_FALLBACK_MS = 100;

/**
 * 移除 app-shell 包注入的预渲染骨架（仅 mobile 世界的挂载流程使用）。
 *
 * 壳存在期间 `#app` 是 `visibility:hidden`（仍参与布局）。删壳推迟到双 rAF：
 * 第一帧强制同步布局，让正文的重布局发生在骨架仍可见的帧内；下一帧再删壳，
 * 揭幕帧只剩可见性翻转与 paint，避免"骨架消失 → 空白 → 内容闪现"。
 */
export function removeMobileAppShell(): void {
  const found = document.querySelector<HTMLElement>(
    '[data-loom-app-shell="true"]',
  );
  if (found === null) return;
  // 闭包内不保留上面的空值收窄，绑定成非空常量再使用。
  const shell = found;
  let removed = false;
  const fallback = window.setTimeout(remove, APP_SHELL_REVEAL_FALLBACK_MS);
  function remove(): void {
    if (removed) return;
    removed = true;
    window.clearTimeout(fallback);
    shell.remove();
  }
  window.requestAnimationFrame(() => {
    // 强制同步布局：读取挂载点几何属性，确保隐藏态的正文在本帧完成布局。
    void document.getElementById(PAGE_MOUNT_ELEMENT_ID)?.offsetHeight;
    window.requestAnimationFrame(remove);
  });
}
