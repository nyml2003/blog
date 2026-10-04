import "../../desktop/foundation/styles/home.css";
import { createDesktopEditorPage } from "@blog/page-desktop-editor/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorPage(context, false));
