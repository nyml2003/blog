import "../../desktop/foundation/styles/home.css";
import { createDesktopAdminPreviewPage } from "@blog/page-desktop-admin-preview/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminPreviewPage(context));
