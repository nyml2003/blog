import { createEffect, For, onCleanup } from "solid-js";
import { Chip } from "./chip.tsx";
import { scrollIntoRowView } from "./scroll.ts";

export interface ChipItem {
  readonly id: string;
  readonly label: string;
}
export interface ChipGroupProps {
  readonly ariaLabel: string;
  readonly items: readonly ChipItem[];
  readonly onChange: (id: string) => void;
  readonly selectedId: string;
}

export function ChipGroup(props: ChipGroupProps) {
  let list: HTMLDivElement | undefined;
  // id → 元素直连：渲染时由 ref 回调登记（卸载即删），选中变化直接取，
  // 不做 DOM 反查。选中项滚入完整视野：切换选中、或列表整体更换（如切换
  // 根分类）后自动对齐；只动容器 scrollLeft，不触发页面级滚动。
  const chips = new Map<string, HTMLButtonElement>();

  createEffect(() => {
    const selectedId = props.selectedId; // 读取即订阅：选中变化重跑
    void props.items; // 列表整体更换（选中未变）时也要重新对齐
    const container = list;
    const chip = chips.get(selectedId);
    if (container === undefined || chip === undefined) return;
    scrollIntoRowView(container, chip);
  });

  return (
    <div
      aria-label={props.ariaLabel}
      class="m-chip-group"
      ref={list}
      role="radiogroup"
    >
      <For each={props.items}>
        {(item) => (
          <Chip
            content={item.label}
            onSelect={() => props.onChange(item.id)}
            options={{}}
            ref={(element) => {
              chips.set(item.id, element);
              onCleanup(() => chips.delete(item.id));
            }}
            selected={props.selectedId === item.id}
          />
        )}
      </For>
    </div>
  );
}
