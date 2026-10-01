import { Show, type Component } from "solid-js";
import type { DesktopPageContext } from "../../foundation/context";
import { route } from "../../foundation/context";
import { useDesktopLogin } from "../../features/login/model";

export function createDesktopLoginPage(input: DesktopPageContext): Component {
  return function DesktopLoginPage() {
    const login = useDesktopLogin(input.api);
    const homeHref = route(input.routes, "desktop-public-home");
    const adminHref = route(input.routes, "desktop-admin-home");
    const submit = async (event: SubmitEvent) => {
      event.preventDefault();
      const result = await login.submit();
      if (result.ok) window.location.replace(adminHref);
    };
    return (
      <div class="desktop-login">
        <a class="skip" href="#main">
          跳到主内容
        </a>
        <header>
          <a class="brand" href={homeHref}>
            <span>FIELD NOTES</span>
            <strong>技术知识库</strong>
          </a>
          <a href={homeHref}>返回站点</a>
        </header>
        <main id="main">
          <div>
            <p class="eyebrow">ADMIN ACCESS</p>
            <h1>管理台登录</h1>
          </div>
          <form onSubmit={submit} aria-busy={login.busy()}>
            <label for="admin-password">
              密码
              <input
                id="admin-password"
                type="password"
                autocomplete="current-password"
                required
                value={login.password()}
                onInput={(event) =>
                  login.setPassword(event.currentTarget.value)
                }
              />
            </label>
            <fieldset>
              <legend>验证方式</legend>
              <label>
                <input
                  type="radio"
                  name="verification-kind"
                  checked={login.kind() === "totp"}
                  onChange={() => {
                    login.setKind("totp");
                    login.setCode("");
                  }}
                />
                动态验证码
              </label>
              <label>
                <input
                  type="radio"
                  name="verification-kind"
                  checked={login.kind() === "recovery"}
                  onChange={() => {
                    login.setKind("recovery");
                    login.setCode("");
                  }}
                />
                恢复码
              </label>
            </fieldset>
            <label for="verification-code">
              {login.kind() === "totp" ? "6 位动态验证码" : "恢复码"}
              <input
                id="verification-code"
                type="text"
                required
                value={login.code()}
                onInput={(event) => login.setCode(event.currentTarget.value)}
              />
            </label>
            <Show when={login.error()}>
              {(message) => <p role="alert">{message()}</p>}
            </Show>
            <button type="submit" disabled={login.busy()}>
              {login.busy() ? "正在验证..." : "登录"}
            </button>
          </form>
        </main>
      </div>
    );
  };
}
