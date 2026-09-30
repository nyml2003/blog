import "../../habitat/desktop/styles/home.css";
import { createDesktopAdminPreviewPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminPreviewPage(context));
