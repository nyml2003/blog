import "../../desktop/foundation/styles/home.css";
import { createDesktopHomePage } from "@blog/page-desktop-home/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopHomePage(context));
