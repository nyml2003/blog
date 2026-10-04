import "../../mobile/foundation/styles/app.css";
import { createMobileAdminPreviewPage } from "@blog/page-mobile-admin-preview/page";
import { mountMobilePage } from "./environment";

mountMobilePage((context) => createMobileAdminPreviewPage(context));
