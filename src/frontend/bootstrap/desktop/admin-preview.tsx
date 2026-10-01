import "../../desktop/foundation/styles/home.css";
import { createDesktopAdminPreviewPage } from "../../desktop/pages/admin-preview/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminPreviewPage(context));
