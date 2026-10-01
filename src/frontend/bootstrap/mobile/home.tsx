import "../../mobile/foundation/styles/app.css";
import { createMobileHomePage } from "../../mobile/pages/home/page";
import { mountMobilePage } from "./environment";

mountMobilePage((context) =>
  createMobileHomePage({
    api: context.api,
    routes: context.routes,
    navigation: context.navigation,
    persistence: context.persistence,
    document: context.document,
    share: context.share,
  }),
);
