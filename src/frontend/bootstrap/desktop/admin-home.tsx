import "../../desktop/foundation/styles/home.css";
import { createDesktopAdminHomePage } from "../../desktop/pages/admin-home/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminHomePage(context));
