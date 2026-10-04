import "../../desktop/foundation/styles/home.css";
import { createDesktopLoginPage } from "@blog/page-desktop-login/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopLoginPage(context));
