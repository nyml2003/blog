import "../../habitat/desktop/styles/home.css";
import { createDesktopDetailPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopDetailPage(context));
