import { createEffect, For, onCleanup } from "solid-js";
import { Tab } from "./tab.tsx";
import { scrollIntoRowView } from "./scroll.ts";

export interface TabItem {
  readonly id: string;
  readonly label: string;
}
export interface TabGroupProps {
  readonly ariaLabel: string;
  readonly items: readonly TabItem[];
  readonly onChange: (id: string) => void;
  readonly selectedId: string;
  readonly orientation: "horizontal" | "vertical";
}

export function TabGroup(props: TabGroupProps) {
  let list: HTMLDivElement | undefined;
  // id → 元素直连：渲染时由 ref 回调登记（卸载即删），选中变化直接取，
  // 不做 DOM 反查。选中项滚入完整视野（同 ChipGroup）；
  // 纵向组本身不滚动，直接跳过。
  const tabs = new Map<string, HTMLButtonElement>();

  createEffect(() => {
    if (props.orientation !== "horizontal") return;
    const selectedId = props.selectedId; // 读取即订阅：选中变化重跑
    void props.items; // 列表整体更换（选中未变）时也要重新对齐
    const container = list;
    const tab = tabs.get(selectedId);
    if (container === undefined || tab === undefined) return;
    scrollIntoRowView(container, tab);
  });

  return (
    <div
      aria-label={props.ariaLabel}
      class={`m-tab-group m-tab-group--${props.orientation}`}
      ref={list}
      role="tablist"
    >
      <For each={props.items}>
        {(item) => (
          <Tab
            content={item.label}
            onSelect={() => props.onChange(item.id)}
            options={{ orientation: props.orientation }}
            ref={(element) => {
              tabs.set(item.id, element);
              onCleanup(() => tabs.delete(item.id));
            }}
            selected={props.selectedId === item.id}
          />
        )}
      </For>
    </div>
  );
}
