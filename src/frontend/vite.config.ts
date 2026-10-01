import { resolve } from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { pageBootstrap } from "./vite-plugins/page-bootstrap.ts";
import { mobilePrefetchServiceWorker } from "./vite-plugins/mobile-prefetch.ts";
import { pageRoutesPlugin } from "./vite-plugins/page-routes.ts";
import {
  generatePageInputs,
  pageRouteMap,
  pageTemplatePlugin,
} from "./vite-plugins/page-template.ts";

const root = resolve(import.meta.dirname);
const apiOrigin = process.env.BLOG_API_ORIGIN ?? "http://127.0.0.1:8080";
const routes = pageRouteMap();
const pageInputs = generatePageInputs(root);

export default defineConfig({
  plugins: [
    pageTemplatePlugin(),
    pageBootstrap(root),
    mobilePrefetchServiceWorker(root),
    pageRoutesPlugin(routes),
    solid(),
  ],
  root,
  build: {
    rolldownOptions: {
      input: pageInputs,
    },
  },
  server: {
    host: "127.0.0.1",
    proxy: { "/api": apiOrigin },
  },
});
