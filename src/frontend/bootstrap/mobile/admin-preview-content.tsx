import "../../mobile/foundation/styles/app.css";
import { createMobileAdminPreviewPage } from "../../mobile/pages/admin-preview/page";
import { mountMobilePage } from "./environment";

mountMobilePage((context) => createMobileAdminPreviewPage(context));
