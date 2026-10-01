import "../../desktop/foundation/styles/home.css";
import { createDesktopLoginPage } from "../../desktop/pages/login/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopLoginPage(context));
