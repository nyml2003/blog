import "../../habitat/desktop/styles/home.css";
import { createDesktopTaxonomyPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopTaxonomyPage(context));
