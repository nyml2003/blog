import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileHomePage } from "../../habitat/mobile";

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
