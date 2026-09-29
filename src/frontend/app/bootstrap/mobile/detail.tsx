import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileDetailPage } from "../../habitat/mobile";
import { route } from "../../habitat/mobile/context";
import { articleIdFromSearch, canReturnToSite } from "./detail-input";

const createDetailPage: Parameters<typeof mountMobilePage>[0] = (context) =>
  createMobileDetailPage({
    id: articleIdFromSearch(context.navigation.current().search),
    api: context.api,
    articleListHref: route(context.routes, "mobile-articles"),
    onBack(event) {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !canReturnToSite(
          document.referrer,
          window.location.origin,
          window.history.length,
        )
      ) {
        return;
      }
      event.preventDefault();
      context.navigation.back();
    },
  });

mountMobilePage(createDetailPage);
