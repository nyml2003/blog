import "../../mobile/foundation/styles/app.css";
import { createFavoriteStore } from "@blog/page-mobile-detail/favorites";
import { route } from "../../mobile/foundation/context";
import { createMobileDetailPage } from "@blog/page-mobile-detail/page";
import { articleIdFromSearch, canReturnToSite } from "./detail-input";
import { mountMobilePage, removeMobileAppShell } from "./environment";

const createDetailPage: Parameters<typeof mountMobilePage>[0] = (context) =>
  createMobileDetailPage({
    context,
    navigation: context.navigation,
    persistence: context.persistence,
    favorites: createFavoriteStore(context.persistence),
    document: context.document,
    share: context.share,
    onAppShellReady: removeMobileAppShell,
    id: articleIdFromSearch(context.navigation.current().search),
    api: context.api,
    articleListHref: route(context.routes, "mobile-articles"),
    onBack() {
      if (
        canReturnToSite(
          document.referrer,
          window.location.origin,
          window.history.length,
        )
      ) {
        context.navigation.back();
        return;
      }
      context.navigation.push(
        route(context.routes, "mobile-articles"),
        undefined,
      );
    },
  });

mountMobilePage(createDetailPage);
