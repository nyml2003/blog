import { createSignal } from "solid-js";
import type { AdminSessionLoginInput, DesktopApi } from "../../foundation/api";

export function useDesktopLogin(api: Pick<DesktopApi, "adminSession">) {
  const [password, setPassword] = createSignal("");
  const [code, setCode] = createSignal("");
  const [kind, setKind] =
    createSignal<AdminSessionLoginInput["verification"]["kind"]>("totp");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();
  const submit = async () => {
    if (busy()) return { ok: false as const };
    setBusy(true);
    setError(undefined);
    const result = await api.adminSession
      .login({
        password: password(),
        verification: { kind: kind(), code: code().trim() },
      })
      .start();
    if (!result.ok) {
      setCode("");
      setError(
        "message" in result.error
          ? result.error.message
          : "登录失败，请检查凭证",
      );
      setBusy(false);
      return result;
    }
    setPassword("");
    setCode("");
    setBusy(false);
    return result;
  };
  return {
    password,
    setPassword,
    code,
    setCode,
    kind,
    setKind,
    busy,
    error,
    submit,
  };
}
