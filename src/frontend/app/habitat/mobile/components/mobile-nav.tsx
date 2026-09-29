import { Link, Text } from "../ui";
import { route } from "../context";
import type { MobileRouteContext } from "../context";

export interface MobileNavProps {
  readonly context: MobileRouteContext;
}

export function MobileNav(props: MobileNavProps) {
  return (
    <>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class="mobile-header">
        <div class="mobile-brand">
          <Link
            content={
              <>
                <Text
                  content="FIELD NOTES"
                  options={{ tone: "accent", size: "meta" }}
                />
                <strong>技术知识库</strong>
              </>
            }
            href={route(props.context.routes, "mobile-home")}
            options={{}}
          />
        </div>
      </header>
    </>
  );
}
