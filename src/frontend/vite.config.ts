import { resolve } from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { pageBootstrap } from "./build/page-bootstrap.ts";
import { mobilePrefetchServiceWorker } from "./build/mobile-prefetch.ts";
import {
  generatePageInputs,
  pageRouteMap,
  pageTemplatePlugin,
} from "./build/page-template.ts";

const root = resolve(import.meta.dirname);
const apiOrigin = process.env.BLOG_API_ORIGIN ?? "http://127.0.0.1:8080";
const routes = pageRouteMap();
const pageInputs = generatePageInputs(root);

export default defineConfig({
  plugins: [
    pageTemplatePlugin(),
    pageBootstrap(root),
    mobilePrefetchServiceWorker(root),
    {
      name: "mvp-page-routes",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url) {
            const url = new URL(request.url, "http://localhost");
            const target = routes.get(url.pathname);
            if (target) request.url = `${target}${url.search}`;
          }
          next();
        });
      },
    },
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
