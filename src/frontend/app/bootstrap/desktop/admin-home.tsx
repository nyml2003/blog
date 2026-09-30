import "../../habitat/desktop/styles/home.css";
import { createDesktopAdminHomePage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopAdminHomePage(context));
