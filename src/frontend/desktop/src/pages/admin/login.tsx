import { createSignal, Show } from "solid-js";
import { Button, Field } from "../../../../desktop-ui";
import {
  adminNextFromSearch,
  adminSessionPaths,
  loginAdminSession,
  publicHomeHref,
  queryErrorMessage,
  type AdminSessionVerification,
} from "../../../../solid/queries";
import { definePage } from "../../../../solid/page";
import "../../styles.css";
import "../../integration.css";

type VerificationKind = AdminSessionVerification["kind"];

const App = () => {
  const [password, setPassword] = createSignal("");
  const [verificationCode, setVerificationCode] = createSignal("");
  const [verificationKind, setVerificationKind] =
    createSignal<VerificationKind>("totp");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  const selectVerificationKind = (kind: VerificationKind) => {
    setVerificationKind(kind);
    setVerificationCode("");
    setError(undefined);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (busy()) return;

    setBusy(true);
    setError(undefined);
    const result = await loginAdminSession({
      password: password(),
      verification: {
        kind: verificationKind(),
        code: verificationCode().trim(),
      },
    });
    if (!result.ok) {
      setVerificationCode("");
      setError(queryErrorMessage(result.error, "登录失败，请检查凭证"));
      setBusy(false);
      return;
    }

    setPassword("");
    setVerificationCode("");
    location.replace(
      adminNextFromSearch(
        location.search,
        location.origin,
        adminSessionPaths(),
      ),
    );
  };

  return (
    <div class="login-shell">
      <a class="skip" href="#main">
        跳到主内容
      </a>
      <header class="login-header">
        <a class="brand" href={publicHomeHref()}>
          <span class="brand-kicker">FIELD NOTES</span>
          <strong>技术知识库</strong>
        </a>
        <a class="login-site-link" href={publicHomeHref()}>
          返回站点
        </a>
      </header>
      <main id="main" class="login-page">
        <div class="login-heading">
          <p class="eyebrow">ADMIN ACCESS</p>
          <h1>管理台登录</h1>
        </div>
        <form class="login-form" onSubmit={submit} aria-busy={busy()}>
          <Field
            control={
              <input
                id="admin-password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                value={password()}
                onInput={(event) => setPassword(event.currentTarget.value)}
              />
            }
            controlId="admin-password"
            label="密码"
          />

          <fieldset class="login-verification-kind">
            <legend>验证方式</legend>
            <label>
              <input
                type="radio"
                name="verification-kind"
                checked={verificationKind() === "totp"}
                onChange={() => selectVerificationKind("totp")}
              />
              动态验证码
            </label>
            <label>
              <input
                type="radio"
                name="verification-kind"
                checked={verificationKind() === "recovery"}
                onChange={() => selectVerificationKind("recovery")}
              />
              恢复码
            </label>
          </fieldset>

          <Field
            control={
              <input
                id="admin-verification-code"
                name="verification-code"
                type="text"
                inputmode={verificationKind() === "totp" ? "numeric" : "text"}
                autocomplete="one-time-code"
                pattern={verificationKind() === "totp" ? "[0-9]{6}" : undefined}
                maxlength={verificationKind() === "totp" ? 6 : undefined}
                required
                value={verificationCode()}
                aria-invalid={error() !== undefined}
                aria-describedby={
                  error() === undefined ? undefined : "login-error"
                }
                onInput={(event) =>
                  setVerificationCode(event.currentTarget.value)
                }
              />
            }
            controlId="admin-verification-code"
            label={verificationKind() === "totp" ? "6 位动态验证码" : "恢复码"}
          />

          <Show when={error()}>
            {(message) => (
              <div id="login-error" class="error" role="alert">
                {message()}
              </div>
            )}
          </Show>
          <Button
            content={busy() ? "正在验证..." : "登录"}
            options={{
              state: busy() ? "loading" : "enabled",
              type: "submit",
              variant: "primary",
              width: "block",
            }}
          />
        </form>
      </main>
    </div>
  );
};

definePage(App);
