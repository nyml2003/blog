import { createComponent, type Component } from "solid-js";
import { render } from "solid-js/web";
import { bootstrapSiteRoutes } from "./queries/site-routes";

function RouteBootstrapFailure() {
  return (
    <main>
      <p role="alert">页面路由加载失败，请重试。</p>
      <button type="button" onClick={() => location.reload()}>
        重试
      </button>
    </main>
  );
}

export function definePage(Page: Component): void {
  const mount = document.getElementById("app");
  if (!mount) {
    throw new Error('Page mount element "#app" is missing');
  }

  // SPEC-SITE-ROUTES-001：先完成后端路由清单引导再渲染页面；
  // 失败不回退到任何前端字面量路径，交给错误态重试。
  bootstrapSiteRoutes().then(
    () => render(() => createComponent(Page, {}), mount),
    () => render(() => createComponent(RouteBootstrapFailure, {}), mount),
  );
}
