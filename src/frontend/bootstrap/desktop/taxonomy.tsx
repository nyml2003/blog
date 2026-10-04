import "../../desktop/foundation/styles/home.css";
import { createDesktopTaxonomyPage } from "@blog/page-desktop-taxonomy/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopTaxonomyPage(context));
