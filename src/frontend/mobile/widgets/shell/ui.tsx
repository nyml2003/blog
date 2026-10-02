import type { JSX } from "solid-js";
import type { MobileRouteContext } from "../../foundation/context";
import { mobileNavigationItems } from "../../features/navigation/model";
import { BottomNav } from "./bottom-nav";
import { Navigator } from "./navigator";
import type { MobileNavigation } from "../../foundation/api";
import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
} from "@fluvient-loom/port";

export interface MobileShellProps {
  readonly context: MobileRouteContext;
  readonly activeId: string;
  readonly children: JSX.Element;
  readonly navigation?: MobileNavigation;
  readonly browserNavigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
}

export function MobileShell(props: MobileShellProps) {
  return (
    <div class="mobile-shell">
      <Navigator
        context={props.context}
        navigation={props.navigation}
        browserNavigation={props.browserNavigation}
        persistence={props.persistence}
        document={props.document}
        share={props.share}
      />
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
