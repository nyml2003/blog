import "../../desktop/foundation/styles/home.css";
import { createDesktopEditorGuidePage } from "../../desktop/pages/editor-guide/page";
import { mountDesktopPage } from "./environment";

mountDesktopPage((context) => createDesktopEditorGuidePage(context));
