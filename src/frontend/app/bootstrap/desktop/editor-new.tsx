import "../../habitat/desktop/styles/home.css";
import { createDesktopEditorPage } from "../../habitat/desktop";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorPage(context, true));
