import "../../habitat/desktop/styles/home.css";
import { createDesktopEditorGuidePage } from "../../habitat/desktop/pages/editor-guide";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorGuidePage(context));
