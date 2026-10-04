import "../../mobile/foundation/styles/app.css";
import { createMobileArticlesPage } from "@blog/page-mobile-articles/page";
import { mountMobilePage } from "./environment";

mountMobilePage((context) =>
  createMobileArticlesPage(
    {
      api: context.api,
      navigation: context.navigation,
      routes: context.routes,
      persistence: context.persistence,
      document: context.document,
      share: context.share,
    },
    "全部文章",
  ),
);
