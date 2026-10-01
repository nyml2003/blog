import "../../desktop/foundation/styles/home.css";
import { createDesktopHomePage } from "../../desktop/pages/home/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopHomePage(context));
