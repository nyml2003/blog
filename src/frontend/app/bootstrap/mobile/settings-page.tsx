import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileSettingsPage } from "../../habitat/mobile";

mountMobilePage((context) =>
  createMobileSettingsPage({
    routes: context.routes,
    persistence: context.persistence,
    asyncPersistence: context.asyncPersistence,
    operationId: context.operationId,
    scheduler: context.scheduler,
    navigation: context.navigation,
    document: context.document,
  }),
);
