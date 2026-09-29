import "../../habitat/mobile/styles/app.css";
import { mountMobilePage } from "./environment";
import { createMobileHomePage } from "../../habitat/mobile";

mountMobilePage((context) =>
  createMobileHomePage({ api: context.api, routes: context.routes }),
);
