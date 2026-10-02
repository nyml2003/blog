import {
  ArrowLeft,
  Ellipsis,
  Heart,
  Home,
  Search,
  Settings,
  Share2,
  SunMoon,
} from "lucide-solid";
import { createSignal, For, Show } from "solid-js";
import { Link } from "../../foundation/ui";
import { route } from "../../foundation/context";
import type { MobileRouteContext } from "../../foundation/context";
import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
} from "@fluvient-loom/port";
import {
  type MobileNavigation,
  type MobileNavigationIcon,
} from "../../foundation/api";

export interface MobileNavProps {
  readonly context: MobileRouteContext;
  readonly navigation?: MobileNavigation;
  /** 收藏状态与领域动作由 feature store 提供；组件不接触持久化细节。 */
  readonly favorite?: { readonly active: boolean; readonly toggle: () => void };
  readonly browserNavigation: NavigationPort;
  /** 仅供 `cycleTheme` 遗留写入使用；theme 双真相收敛后移除。 */
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
  readonly onBack?: () => void;
}

export function MobileNav(props: MobileNavProps) {
  const [moreOpen, setMoreOpen] = createSignal(false);
  const share = async () => {
    const current = props.browserNavigation.current();
    const url =
      props.navigation?.shareUrl ?? `${current.pathname}${current.search}`;
    await props.share(url);
  };
  const cycleTheme = () => {
    const themes = ["paper", "dark", "sepia"] as const;
    const current = props.document.readRootAttribute("data-theme") ?? "paper";
    const next =
      themes[
        (themes.indexOf(current as (typeof themes)[number]) + 1) % themes.length
      ];
    props.document.writeRootAttribute("data-theme", next);
    props.persistence.write("blog.mobile.theme", next);
  };
  const icon = (name: MobileNavigationIcon) => {
    switch (name) {
      case "back":
        return <ArrowLeft size={18} aria-hidden="true" />;
      case "search":
        return <Search size={18} aria-hidden="true" />;
      case "favorite":
        return (
          <Heart
            size={18}
            fill={props.favorite?.active === true ? "currentColor" : "none"}
            aria-hidden="true"
          />
        );
      case "share":
        return <Share2 size={18} aria-hidden="true" />;
      case "more":
        return <Ellipsis size={18} aria-hidden="true" />;
    }
  };
  const action = (name: MobileNavigationIcon) => {
    if (name === "favorite") return props.favorite?.toggle;
    if (name === "share") return () => void share();
    if (name === "more") return () => setMoreOpen((value) => !value);
    if (name === "back")
      return props.onBack ?? (() => props.browserNavigation.back());
    if (name === "search")
      return () => {
        props.browserNavigation.push(
          route(props.context.routes, "mobile-articles"),
          undefined,
        );
      };
    return undefined;
  };
  return (
    <>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class="mobile-header">
        <nav class="mobile-actions" aria-label="页面操作">
          <div class="mobile-actions-left">
            <For each={props.navigation?.leftIcons ?? []}>
              {(name) => (
                <button
                  type="button"
                  aria-label={name}
                  title={name}
                  onClick={action(name)}
                >
                  {icon(name)}
                </button>
              )}
            </For>
          </div>
          <div class="mobile-actions-right">
            <For each={props.navigation?.rightIcons ?? []}>
              {(name) => (
                <button
                  type="button"
                  aria-label={name}
                  title={name}
                  onClick={action(name)}
                >
                  {icon(name)}
                </button>
              )}
            </For>
          </div>
        </nav>
        <Show when={moreOpen()}>
          <div class="mobile-more-menu" role="menu">
            <Link
              href={route(props.context.routes, "mobile-home")}
              content={
                <>
                  <Home size={16} /> 首页
                </>
              }
              options={{}}
            />
            <Show when={props.favorite !== undefined}>
              <button type="button" onClick={() => props.favorite?.toggle()}>
                <Heart size={16} /> 收藏
              </button>
            </Show>
            <button type="button" onClick={() => void share()}>
              <Share2 size={16} /> 分享
            </button>
            <Link
              href={route(props.context.routes, "mobile-settings")}
              content={
                <>
                  <Settings size={16} /> 设置
                </>
              }
              options={{}}
            />
            <button type="button" onClick={cycleTheme}>
              <SunMoon size={16} /> 主题
            </button>
          </div>
        </Show>
      </header>
    </>
  );
}
