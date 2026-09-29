import { Show, type Component } from "solid-js";
import type { MobileRouteContext } from "../context";
import type {
  AsyncPersistencePort,
  DocumentPort,
  NavigationPort,
  OperationIdPort,
  PersistencePort,
  SchedulerPort,
} from "../../../kernel";
import { mobileNavigationItems } from "../logic/navigation";
import { mobileSettingsOptions } from "../logic/settings";
import { useMobileSettings } from "../logic/settings-page";
import { MobileNav } from "../components";
import { BottomNav, Field, Heading, Select, Text } from "../ui";

export interface MobileSettingsPageInput extends MobileRouteContext {
  readonly persistence: PersistencePort;
  readonly asyncPersistence: AsyncPersistencePort;
  readonly operationId: OperationIdPort;
  readonly scheduler: SchedulerPort;
  readonly navigation: NavigationPort;
  readonly document: DocumentPort;
}

export function createMobileSettingsPage(
  input: MobileSettingsPageInput,
): Component {
  return function MobileSettingsPage() {
    const settingsPage = useMobileSettings(input);
    return (
      <div class="mobile-shell">
        <MobileNav context={input} />
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
                  value={settingsPage.settings().theme}
                  onChange={(theme) => settingsPage.saveChanges({ theme })}
                  options={{ name: "theme" }}
                />
              }
            />
            <Field
              label="正文字体"
              content={
                <Select
                  items={mobileSettingsOptions.fonts}
                  value={settingsPage.settings().font}
                  onChange={(font) => settingsPage.saveChanges({ font })}
                  options={{ name: "font" }}
                />
              }
            />
          </div>
          <Show when={settingsPage.mutation.state().status === "error"}>
            <p class="settings-feedback" role="alert">
              <Text
                content="设置保存失败，已恢复上一次稳定状态。"
                options={{ tone: "muted", size: "meta" }}
              />
              <button
                type="button"
                onClick={() => void settingsPage.mutation.retry()}
              >
                重试
              </button>
            </p>
          </Show>
          <Show
            when={
              settingsPage.query.state().status === "error" &&
              settingsPage.mutation.state().status !== "error"
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
          items={mobileNavigationItems(input)}
          activeId="settings"
          ariaLabel="页面导航"
        />
      </div>
    );
  };
}
