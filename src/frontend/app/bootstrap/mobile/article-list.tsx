import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileArticlesPage } from "../../habitat/mobile";

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
    "分类浏览",
  ),
);
