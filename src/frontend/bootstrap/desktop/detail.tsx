import "../../desktop/foundation/styles/home.css";
import { createDesktopDetailPage } from "../../desktop/pages/detail/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopDetailPage(context));
