import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileArticlesPage } from "../../habitat/mobile";

mountMobilePage((context) => createMobileArticlesPage(context, "分类浏览"));
