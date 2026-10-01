import "../../mobile/foundation/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileDetailPage } from "../../mobile/pages/detail/page";
import { route } from "../../mobile/foundation/context";
import { articleIdFromSearch, canReturnToSite } from "./detail-input";

const createDetailPage: Parameters<typeof mountMobilePage>[0] = (context) =>
  createMobileDetailPage({
    context,
    navigation: context.navigation,
    persistence: context.persistence,
    document: context.document,
    share: context.share,
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
