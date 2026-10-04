import { err, toErrorInfo } from "@fluvient/core";
import type { TaskFailure } from "@fluvient-loom/port";
import {
  type AsyncPersistencePort,
  type DocumentPort,
  type NavigationPort,
  type OperationIdPort,
  type PersistencePort,
  type SchedulerPort,
} from "@fluvient-loom/port";
import { createDataTask } from "@fluvient-loom/query";
import { type Component, onMount, Show } from "solid-js";
import { mobileNavigationItems } from "@blog/mobile-shared";
import { mobileSettingsOptions } from "./model.ts";
import { useMobileSettings } from "./page-model.ts";
import type { MobileNavigation } from "@blog/mobile-api";
import {
  type MobileApi,
  type MobileApiFailure,
  navigationFromPage,
} from "@blog/mobile-api";
import type { MobileRouteContext } from "@blog/mobile-shared";
import { useMobileResource } from "@blog/mobile-api";
import { Field, Heading, Select, Text } from "@blog/mobile-shared";
import { BottomNav } from "@blog/mobile-shared";
import { StandardNavigator } from "@blog/mobile-shared";

export interface MobileSettingsPageInput extends MobileRouteContext {
  readonly api: Pick<MobileApi, "page">;
  readonly persistence: PersistencePort;
  readonly asyncPersistence: AsyncPersistencePort;
  readonly operationId: OperationIdPort;
  readonly scheduler: SchedulerPort;
  readonly navigation: NavigationPort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
}

export function createMobileSettingsPage(
  input: MobileSettingsPageInput,
): Component {
  return function MobileSettingsPage() {
    const settingsPage = useMobileSettings(input);
    const page = useMobileResource(() =>
      createDataTask<
        MobileNavigation | undefined,
        MobileApiFailure | TaskFailure
      >({
        async execute() {
          const result = await input.api.page.get("settings").start();
          if (!result.ok)
            return err({
              kind: "network" as const,
              message: "请求执行失败",
              code: undefined,
              status: undefined,
              issues: undefined,
            });
          return { ok: true as const, value: navigationFromPage(result.value) };
        },
        mapRejected(cause) {
          return {
            kind: "network" as const,
            message: cause instanceof Error ? cause.message : "请求执行失败",
            code: undefined,
            status: undefined,
            issues: undefined,
            cause: toErrorInfo(cause),
          } satisfies MobileApiFailure;
        },
      }),
    );
    onMount(() => void page.start());
    return (
      <div class="mobile-shell">
        <StandardNavigator
          context={input}
          navigation={page.state()?.snapshot}
          browserNavigation={input.navigation}
          persistence={input.persistence}
          document={input.document}
          share={input.share}
        />
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
