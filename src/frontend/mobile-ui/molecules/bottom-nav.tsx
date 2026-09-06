import { For } from "solid-js";
import { Link } from "../atoms/link";

export type NavigationItem = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly mark: string;
};

export type BottomNavProps = {
  items: readonly NavigationItem[];
  activeId: string;
  ariaLabel: string;
};

export function BottomNav(props: BottomNavProps) {
  return (
    <nav class="m-bottom-nav" aria-label={props.ariaLabel}>
      <ul class="m-bottom-nav-items">
        <For each={props.items}>
          {(item) => (
            <li
              class="m-bottom-nav-item"
              classList={{ "is-active": props.activeId === item.id }}
            >
              <Link
                content={
                  <>
                    <span aria-hidden="true" class="m-bottom-nav-mark">
                      {item.mark}
                    </span>
                    <span class="m-bottom-nav-label">{item.label}</span>
                  </>
                }
                href={item.href}
                options={{
                  ariaCurrent: props.activeId === item.id ? "page" : undefined,
                }}
              />
            </li>
          )}
        </For>
      </ul>
    </nav>
  );
}
