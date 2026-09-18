import { createSignal, Show } from "solid-js";
import { Button } from "../../../desktop-ui";
import {
  adminEditorGuideHref,
  adminHomeHref,
  adminLoginHref,
  adminWorkspaceHref,
  logoutAdminSession,
  publicArchiveHref,
  publicHomeHref,
  queryErrorMessage,
} from "../../../solid/queries";

/** Desktop 页头壳：品牌、主导航、管理端登出（SPEC-SITE-ROUTES-001：导航值来自后端清单）。 */
export function Header(props: { admin?: boolean }) {
  const current = location.pathname;
  const [logoutBusy, setLogoutBusy] = createSignal(false);
  const [logoutError, setLogoutError] = createSignal<string | undefined>();
  const routes = {
    home: publicHomeHref(),
    archive: publicArchiveHref(),
    adminHome: adminHomeHref(),
    workspace: adminWorkspaceHref(),
    guide: adminEditorGuideHref(),
    login: adminLoginHref(),
  };
  const active = (href: string) => {
    if (href === routes.home) return current === routes.home;
    if (href === routes.adminHome) {
      const adminDir = routes.adminHome.slice(
        0,
        routes.adminHome.lastIndexOf("/") + 1,
      );
      return (
        current === adminDir ||
        current === routes.adminHome ||
        current.startsWith(`${adminDir}articles`)
      );
    }
    return current.startsWith(href.replace("/index.html", ""));
  };
  return (
    <>
      <a class="skip" href="#main">
        跳到主内容
      </a>
      <header class="topbar">
        <a class="brand" href={props.admin ? routes.adminHome : routes.home}>
          <span class="brand-kicker">
            {props.admin ? "管理台" : "FIELD NOTES"}
          </span>
          <strong>技术知识库</strong>
        </a>
        <nav class="nav" aria-label="主导航">
          {props.admin ? (
            <>
              <a href={routes.home}>返回站点</a>
              <a
                aria-current={active(routes.adminHome) ? "page" : undefined}
                href={routes.adminHome}
              >
                文章
              </a>
              <a
                aria-current={active(routes.workspace) ? "page" : undefined}
                href={routes.workspace}
              >
                分类工作台
              </a>
              <a
                aria-current={active(routes.guide) ? "page" : undefined}
                href={routes.guide}
              >
                指南
              </a>
              <Button
                content={logoutBusy() ? "退出中..." : "退出"}
                options={{
                  state: logoutBusy() ? "loading" : "enabled",
                  onClick: async () => {
                    setLogoutError(undefined);
                    setLogoutBusy(true);
                    const result = await logoutAdminSession();
                    if (result.ok) {
                      location.replace(routes.login);
                      return;
                    }
                    setLogoutError(
                      queryErrorMessage(result.error, "退出失败，请重试"),
                    );
                    setLogoutBusy(false);
                  },
                }}
              />
              <Show when={logoutError()}>
                {(message) => (
                  <span class="nav-error" role="alert">
                    {message()}
                  </span>
                )}
              </Show>
            </>
          ) : (
            <>
              <a
                aria-current={active(routes.home) ? "page" : undefined}
                href={routes.home}
              >
                首页
              </a>
              <a
                aria-current={active(routes.archive) ? "page" : undefined}
                href={routes.archive}
              >
                全部文章
              </a>
            </>
          )}
        </nav>
      </header>
    </>
  );
}
