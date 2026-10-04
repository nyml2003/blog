import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
} from "@fluvient-loom/port";
import type { JSX } from "solid-js";
import { mobileNavigationItems } from "../navigation/model.ts";
import type { MobileNavigation } from "@blog/mobile-api";
import type { MobileRouteContext } from "../context.ts";
import { BottomNav } from "./bottom-nav.tsx";
import { StandardNavigator } from "./navigator-icons.tsx";

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
      <StandardNavigator
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
