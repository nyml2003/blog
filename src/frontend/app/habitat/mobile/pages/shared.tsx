import type { JSX } from "solid-js";
import type { MobilePageContext } from "../context";
import { mobileNavigationItems } from "../logic/navigation";
import { BottomNav } from "../ui";
import { MobileNav } from "../components";

export interface MobileShellProps {
  readonly context: MobilePageContext;
  readonly activeId: string;
  readonly children: JSX.Element;
}

export function MobileShell(props: MobileShellProps) {
  return (
    <div class="mobile-shell">
      <MobileNav context={props.context} />
      <main id="main" class="mobile-main">
        {props.children}
      </main>
      <BottomNav
        items={mobileNavigationItems(props.context)}
        activeId={props.activeId}
        ariaLabel="页面导航"
      />
    </div>
  );
}
