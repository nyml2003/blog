import { createSignal, For, Show, type JSX } from "solid-js";
import type { MobileNavigationIcon } from "@blog/mobile-api";

export interface NavigatorMenuState {
  readonly isOpen: boolean;
  readonly toggleOpen: () => void;
}

export interface NavigatorIconDefinition<Context extends object> {
  readonly id: MobileNavigationIcon;
  readonly label: string;
  readonly render: (context: Context) => JSX.Element;
  readonly action: (context: Context & NavigatorMenuState) => void;
  readonly panel?: (context: Context & NavigatorMenuState) => JSX.Element;
}

export function defineNavigatorIcon<Context extends object>(
  definition: NavigatorIconDefinition<Context>,
): NavigatorIconDefinition<Context> {
  return definition;
}

export interface NavigatorProps<Context extends object> {
  readonly icons: readonly NavigatorIconDefinition<Context>[];
  readonly context: Context;
  readonly leftIcons: readonly MobileNavigationIcon[];
  readonly rightIcons: readonly MobileNavigationIcon[];
  readonly title?: string;
  readonly leftLabel?: string;
  readonly leftHref?: string;
  readonly className?: string;
}

export function Navigator<Context extends object>(
  props: NavigatorProps<Context>,
) {
  const [openIcon, setOpenIcon] = createSignal<string | undefined>(undefined);
  const resolve = (id: MobileNavigationIcon) =>
    props.icons.find((icon) => icon.id === id);
  const resolveMany = (ids: readonly MobileNavigationIcon[]) =>
    ids.flatMap((id) => {
      const icon = resolve(id);
      return icon === undefined ? [] : [icon];
    });
  const leftIcons = () => resolveMany(props.leftIcons);
  const rightIcons = () => resolveMany(props.rightIcons);
  const allIcons = () => [...leftIcons(), ...rightIcons()];
  const menuState = (
    icon: NavigatorIconDefinition<Context>,
  ): NavigatorMenuState => ({
    isOpen: openIcon() === icon.id,
    toggleOpen: () =>
      setOpenIcon((current) => (current === icon.id ? undefined : icon.id)),
  });
  const contextFor = (icon: NavigatorIconDefinition<Context>) => ({
    ...props.context,
    ...menuState(icon),
  });

  return (
    <Show when={allIcons().length > 0}>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class={props.className ?? "mobile-header"}>
        <nav class="mobile-actions" aria-label="页面操作">
          <NavigatorActions
            icons={leftIcons()}
            contextFor={contextFor}
            label={props.leftLabel}
            href={props.leftHref}
          />
          <Show when={props.title !== undefined}>
            <span class="mobile-header-title">{props.title}</span>
          </Show>
          <div class="mobile-actions-right">
            <NavigatorActions icons={rightIcons()} contextFor={contextFor} />
          </div>
        </nav>
        <For each={allIcons()}>
          {(icon) => {
            const context = () => contextFor(icon);
            return (
              <Show when={icon.panel !== undefined && context().isOpen}>
                {icon.panel?.(context())}
              </Show>
            );
          }}
        </For>
      </header>
    </Show>
  );
}

function NavigatorActions<Context extends object>(props: {
  readonly icons: readonly NavigatorIconDefinition<Context>[];
  readonly contextFor: (
    icon: NavigatorIconDefinition<Context>,
  ) => Context & NavigatorMenuState;
  readonly label?: string;
  readonly href?: string;
}) {
  return (
    <div class="mobile-actions-left">
      <For each={props.icons}>
        {(icon, index) => {
          const label = () =>
            props.label && index() === 0 ? props.label : icon.label;
          return (
            <Show
              when={props.href !== undefined && index() === 0}
              fallback={
                <button
                  type="button"
                  aria-label={label()}
                  title={label()}
                  onClick={() => icon.action(props.contextFor(icon))}
                >
                  {icon.render(props.contextFor(icon))}
                  <Show when={props.label !== undefined && index() === 0}>
                    <span>{props.label}</span>
                  </Show>
                </button>
              }
            >
              <a
                class="mobile-action-link"
                href={props.href}
                aria-label={label()}
                title={label()}
              >
                {icon.render(props.contextFor(icon))}
                <Show when={props.label !== undefined}>
                  <span>{props.label}</span>
                </Show>
              </a>
            </Show>
          );
        }}
      </For>
    </div>
  );
}
