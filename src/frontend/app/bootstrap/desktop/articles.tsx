import "../../habitat/desktop/styles/home.css";
import { createDesktopArticlesPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopArticlesPage(context));
