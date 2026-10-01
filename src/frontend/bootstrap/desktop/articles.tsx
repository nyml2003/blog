import "../../desktop/foundation/styles/home.css";
import { createDesktopArticlesPage } from "../../desktop/pages/articles/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopArticlesPage(context));
