import type {
  DocumentPort,
  NavigationPort,
  PersistencePort,
} from "@fluvient-loom/port";
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
import { Show } from "solid-js";
import type {
  MobileNavigation,
  MobileNavigationIcon,
} from "../../foundation/api";
import type { MobileRouteContext } from "../../foundation/context";
import { route } from "../../foundation/context";
import { Link } from "../../foundation/ui";
import {
  defineNavigatorIcon,
  Navigator,
  type NavigatorIconDefinition,
  type NavigatorMenuState,
} from "./navigator";

export interface StandardNavigatorContext {
  readonly route: MobileRouteContext;
  readonly browserNavigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
  readonly shareUrl?: string;
  readonly favorite?: { readonly active: boolean; readonly toggle: () => void };
  readonly onBack?: () => void;
}

type IconContext = StandardNavigatorContext & NavigatorMenuState;

const backIcon = defineNavigatorIcon<StandardNavigatorContext>({
  id: "back",
  label: "返回",
  render: () => <ArrowLeft size={18} aria-hidden="true" />,
  action: ({ onBack, browserNavigation }) => {
    if (onBack !== undefined) {
      onBack();
      return;
    }
    browserNavigation.back();
  },
});

const searchIcon = defineNavigatorIcon<StandardNavigatorContext>({
  id: "search",
  label: "搜索",
  render: () => <Search size={18} aria-hidden="true" />,
  action: ({ route: page, browserNavigation }) => {
    browserNavigation.push(route(page.routes, "mobile-articles"), undefined);
  },
});

const favoriteIcon = defineNavigatorIcon<StandardNavigatorContext>({
  id: "favorite",
  label: "收藏",
  render: ({ favorite }) => (
    <Heart
      size={18}
      fill={favorite?.active === true ? "currentColor" : "none"}
      aria-hidden="true"
    />
  ),
  action: ({ favorite }) => {
    void favorite?.toggle();
  },
});

const shareIcon = defineNavigatorIcon<StandardNavigatorContext>({
  id: "share",
  label: "分享",
  render: () => <Share2 size={18} aria-hidden="true" />,
  action: ({ browserNavigation, share, shareUrl }) => {
    const current = browserNavigation.current();
    void share(shareUrl ?? current.pathname + current.search);
  },
});

const moreIcon = defineNavigatorIcon<StandardNavigatorContext>({
  id: "more",
  label: "更多",
  render: () => <Ellipsis size={18} aria-hidden="true" />,
  action: ({ toggleOpen }) => toggleOpen(),
  panel: (context) => <MorePanel context={context} />,
});

export const standardNavigatorIcons: readonly NavigatorIconDefinition<StandardNavigatorContext>[] =
  [backIcon, searchIcon, favoriteIcon, shareIcon, moreIcon];

function MorePanel(props: { readonly context: IconContext }) {
  const { context } = props;
  return (
    <div class="mobile-more-menu" role="menu">
      <Link
        href={route(context.route.routes, "mobile-home")}
        content={
          <>
            <Home size={16} /> 首页
          </>
        }
        options={{}}
      />
      <ShowFavorite context={context} />
      <button
        type="button"
        onClick={() => {
          const current = context.browserNavigation.current();
          void context.share(
            context.shareUrl ?? current.pathname + current.search,
          );
        }}
      >
        <Share2 size={16} /> 分享
      </button>
      <Link
        href={route(context.route.routes, "mobile-settings")}
        content={
          <>
            <Settings size={16} /> 设置
          </>
        }
        options={{}}
      />
      <button type="button" onClick={() => cycleTheme(context)}>
        <SunMoon size={16} /> 主题
      </button>
    </div>
  );
}

function ShowFavorite(props: { readonly context: StandardNavigatorContext }) {
  return props.context.favorite === undefined ? undefined : (
    <button type="button" onClick={() => void props.context.favorite?.toggle()}>
      <Heart size={16} /> 收藏
    </button>
  );
}

export interface StandardNavigatorProps {
  readonly context: MobileRouteContext;
  readonly navigation?: MobileNavigation;
  readonly leftIcons?: readonly MobileNavigationIcon[];
  readonly rightIcons?: readonly MobileNavigationIcon[];
  readonly browserNavigation: NavigationPort;
  readonly persistence: PersistencePort;
  readonly document: DocumentPort;
  readonly share: (url: string) => Promise<void>;
  readonly favorite?: { readonly active: boolean; readonly toggle: () => void };
  readonly onBack?: () => void;
  readonly title?: string;
  readonly leftLabel?: string;
  readonly leftHref?: string;
  readonly className?: string;
}

export function StandardNavigator(props: StandardNavigatorProps) {
  const context: StandardNavigatorContext = {
    route: props.context,
    browserNavigation: props.browserNavigation,
    persistence: props.persistence,
    document: props.document,
    share: props.share,
    shareUrl: props.navigation?.shareUrl,
    favorite: props.favorite,
    onBack: props.onBack,
  };
  return (
    <Navigator
      icons={standardNavigatorIcons}
      context={context}
      leftIcons={props.leftIcons ?? props.navigation?.leftIcons ?? []}
      rightIcons={props.rightIcons ?? props.navigation?.rightIcons ?? []}
      title={props.title}
      leftLabel={props.leftLabel}
      leftHref={props.leftHref}
      className={props.className}
    />
  );
}

function cycleTheme(context: StandardNavigatorContext): void {
  const themes = ["paper", "dark", "sepia"] as const;
  const current = context.document.readRootAttribute("data-theme") ?? "paper";
  const currentIndex = themes.findIndex((theme) => theme === current);
  const next = themes[(currentIndex + 1) % themes.length];
  context.document.writeRootAttribute("data-theme", next);
  context.persistence.write("blog.mobile.theme", next);
}
