import "../../mobile/foundation/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileSettingsPage } from "../../mobile/pages/settings/page";

mountMobilePage((context) =>
  createMobileSettingsPage({
    api: context.api,
    routes: context.routes,
    persistence: context.persistence,
    asyncPersistence: context.asyncPersistence,
    operationId: context.operationId,
    scheduler: context.scheduler,
    navigation: context.navigation,
    document: context.document,
    share: context.share,
  }),
);
