import "../../desktop/foundation/styles/home.css";
import { createDesktopEditorGuidePage } from "@blog/page-desktop-editor-guide/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorGuidePage(context));
