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
import { requireMountTarget } from "./shared.ts";

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
  readonly createPage: (context: Ctx) => Component;
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
  const Page = options.createPage(options.context.value);
  render(() => createComponent(Page, {}), mount);
  options.afterMount?.();
}

/** 移除 app-shell 包注入的预渲染骨架（仅 mobile 世界的挂载流程使用）。 */
export function removeMobileAppShell(): void {
  const shell = document.querySelector<HTMLElement>(
    '[data-loom-app-shell="true"]',
  );
  shell?.remove();
}
