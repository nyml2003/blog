import "../../habitat/mobile/styles/app.css";
import { createMobileAdminPreviewPage } from "../../habitat/mobile/pages/admin-preview";
import { mountMobilePage } from "./environment";

mountMobilePage((context) => createMobileAdminPreviewPage(context));
