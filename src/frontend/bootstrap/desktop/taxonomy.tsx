import "../../desktop/foundation/styles/home.css";
import { createDesktopTaxonomyPage } from "../../desktop/pages/taxonomy/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopTaxonomyPage(context));
