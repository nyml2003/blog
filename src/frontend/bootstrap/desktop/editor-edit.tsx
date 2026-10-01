import "../../desktop/foundation/styles/home.css";
import { createDesktopEditorPage } from "../../desktop/pages/editor/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorPage(context, false));
