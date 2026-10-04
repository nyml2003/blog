import "../../desktop/foundation/styles/home.css";
import { createDesktopAdminHomePage } from "@blog/page-desktop-admin-home/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminHomePage(context));
