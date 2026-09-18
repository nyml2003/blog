import {
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import { createDesiredStateMutation } from "../../../kernel";
import type { MobilePageContext } from "../context";
import { mobileNavigationItems } from "../logic/navigation";
import {
  mobileSettingsOptions,
  createMobileSettingsCommand,
  createMobileSettingsReadTask,
  readMobileSettings,
  type MobileSettingsError,
} from "../logic/settings";
import { MobileNav } from "../components";
import { BottomNav, Field, Heading, Select, Text } from "../ui";
import { useMobileResource } from "../resource";

export function createMobileSettingsPage(
  context: MobilePageContext,
): Component {
  return function MobileSettingsPage() {
    const initial = readMobileSettings(context.persistence);
    const [settings, setSettings] = createSignal(initial);
    const query = useMobileResource(() =>
      createMobileSettingsReadTask(context.asyncPersistence),
    );
    const mutation = createDesiredStateMutation({
      initial,
      disposedError: {
        kind: "settings",
        message: "设置 mutation 已释放",
      } satisfies MobileSettingsError,
      scheduler: context.scheduler,
      operationIds: context.operationId,
      command: createMobileSettingsCommand(context.asyncPersistence),
      invalidate: async () => {
        const result = await query.refetch();
        if (!result.ok) return result;
        return { ok: true as const, value: result.value };
      },
      onState(value) {
        setSettings(value);
        context.document.writeRootAttribute("data-theme", value.theme);
        context.document.writeRootAttribute("data-font", value.font);
      },
    });
    const saveChanges = (changes: Partial<typeof initial>) => {
      void mutation.update(changes);
    };
    const pagehide = context.navigation.subscribePageHide(() => {
      void mutation.flush();
    });
    onMount(() => {
      void query.start();
    });
    createEffect(() => {
      const state = query.state();
      if (state.status === "success" && state.snapshot !== undefined) {
        mutation.reconcile(state.snapshot);
      }
    });
    onCleanup(() => {
      pagehide.release();
      mutation.dispose();
    });
    return (
      <div class="mobile-shell">
        <MobileNav context={context} />
        <main id="main" class="mobile-main">
          <header class="page-heading">
            <Heading content="设置" options={{ as: "h1", size: "page" }} />
          </header>
          <div class="settings-fields">
            <Field
              label="主题风格"
              content={
                <Select
                  items={mobileSettingsOptions.themes}
                  value={settings().theme}
                  onChange={(theme) => saveChanges({ theme })}
                  options={{ name: "theme" }}
                />
              }
            />
            <Field
              label="正文字体"
              content={
                <Select
                  items={mobileSettingsOptions.fonts}
                  value={settings().font}
                  onChange={(font) => saveChanges({ font })}
                  options={{ name: "font" }}
                />
              }
            />
          </div>
          <Show when={mutation.state().status === "error"}>
            <p class="settings-feedback" role="alert">
              <Text
                content="设置保存失败，已恢复上一次稳定状态。"
                options={{ tone: "muted", size: "meta" }}
              />
              <button type="button" onClick={() => void mutation.retry()}>
                重试
              </button>
            </p>
          </Show>
          <Show
            when={
              query.state().status === "error" &&
              mutation.state().status !== "error"
            }
          >
            <p class="settings-feedback" role="status">
              <Text
                content="设置读取失败，当前显示的是本地状态。"
                options={{ tone: "muted", size: "meta" }}
              />
            </p>
          </Show>
        </main>
        <BottomNav
          items={mobileNavigationItems(context)}
          activeId="settings"
          ariaLabel="页面导航"
        />
      </div>
    );
  };
}
