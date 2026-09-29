import { House, LibraryBig, Settings2 } from "lucide-solid";
import { For } from "solid-js";
import { Link } from "../atoms";
import type { NavigationItem } from "../../logic/navigation";

export interface BottomNavProps {
  readonly items: readonly NavigationItem[];
  readonly activeId: string;
  readonly ariaLabel: string;
}

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
                      {item.id === "home" && <House size={20} />}
                      {item.id === "articles" && <LibraryBig size={20} />}
                      {item.id === "settings" && <Settings2 size={20} />}
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
