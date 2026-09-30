import "../../habitat/desktop/styles/home.css";
import { createDesktopLoginPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopLoginPage(context));
