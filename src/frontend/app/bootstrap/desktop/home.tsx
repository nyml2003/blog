import "../../habitat/desktop/styles/home.css";
import { createDesktopHomePage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopHomePage(context));
