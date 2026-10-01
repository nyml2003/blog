import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { createDesiredStateMutation } from "../../../kernel/desired-state";
import {
  type AsyncPersistencePort,
  type DocumentPort,
  type NavigationPort,
  type OperationIdPort,
  type PersistencePort,
  type SchedulerPort,
} from "@fluvient-loom/port";
import type { MobileRouteContext } from "../../foundation/context";
import {
  createMobileSettingsCommand,
  createMobileSettingsReadTask,
  readMobileSettings,
  type MobileSettingsError,
} from "./model";
import { useMobileResource } from "../../foundation/resource";

export interface MobileSettingsLogicInput extends MobileRouteContext {
  readonly persistence: PersistencePort;
  readonly asyncPersistence: AsyncPersistencePort;
  readonly operationId: OperationIdPort;
  readonly scheduler: SchedulerPort;
  readonly navigation: NavigationPort;
  readonly document: DocumentPort;
}

export function useMobileSettings(input: MobileSettingsLogicInput) {
  const initial = readMobileSettings(input.persistence);
  const [settings, setSettings] = createSignal(initial);
  const query = useMobileResource(() =>
    createMobileSettingsReadTask(input.asyncPersistence),
  );
  const mutation = createDesiredStateMutation({
    initial,
    disposedError: {
      kind: "settings",
      message: "设置 mutation 已释放",
    } satisfies MobileSettingsError,
    scheduler: input.scheduler,
    operationIds: input.operationId,
    command: createMobileSettingsCommand(input.asyncPersistence),
    invalidate: async () => {
      const result = await query.refetch();
      if (!result.ok) return result;
      return { ok: true as const, value: result.value };
    },
    onState(value) {
      setSettings(value);
      input.document.writeRootAttribute("data-theme", value.theme);
      input.document.writeRootAttribute("data-font", value.font);
    },
  });
  const pagehide = input.navigation.subscribePageHide(() => {
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

  return {
    mutation,
    query,
    settings,
    saveChanges(changes: Partial<typeof initial>) {
      void mutation.update(changes);
    },
  };
}
