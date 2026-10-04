import "../../desktop/foundation/styles/home.css";
import { createDesktopArticlesPage } from "@blog/page-desktop-articles/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopArticlesPage(context));
