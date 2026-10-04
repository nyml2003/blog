import "../../desktop/foundation/styles/home.css";
import { createDesktopDetailPage } from "@blog/page-desktop-detail/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopDetailPage(context));
