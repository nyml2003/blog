import { resolve } from "node:path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { mobileSettingsBootstrap } from "./build/mobile-settings-bootstrap";

const root = resolve(import.meta.dirname);
const apiOrigin = process.env.BLOG_API_ORIGIN ?? "http://127.0.0.1:8080";
const routes: Record<string, string> = {
  "/": "/desktop/pages/public-home/index.html",
  "/articles/index.html": "/desktop/pages/public-articles/index.html",
  "/articles/detail.html": "/desktop/pages/public-detail/index.html",
  "/m": "/mobile/pages/home/index.html",
  "/m/": "/mobile/pages/home/index.html",
  "/m/articles/index.html": "/mobile/pages/articles/index.html",
  "/m/articles/detail.html": "/mobile/pages/article-detail/index.html",
  "/m/settings/index.html": "/mobile/pages/settings/index.html",
  "/admin": "/desktop/pages/admin-home/index.html",
  "/admin/": "/desktop/pages/admin-home/index.html",
  "/admin/index.html": "/desktop/pages/admin-home/index.html",
  "/admin/articles/new.html": "/desktop/pages/admin-article-new/index.html",
  "/admin/articles/edit.html": "/desktop/pages/admin-article-edit/index.html",
  "/admin/editor-guide/index.html":
    "/desktop/pages/admin-editor-guide/index.html",
  "/admin/article-types/index.html":
    "/desktop/pages/admin-article-types/index.html",
  "/admin/terms/index.html": "/desktop/pages/admin-terms/index.html",
};

export default defineConfig({
  plugins: [
    mobileSettingsBootstrap(root),
    {
      name: "mvp-page-routes",
      configureServer(server) {
        server.middlewares.use((request, _response, next) => {
          if (request.url) {
            const url = new URL(request.url, "http://localhost");
            const target = routes[url.pathname];
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
      input: {
        home: resolve(root, "desktop/pages/public-home/index.html"),
        articles: resolve(root, "desktop/pages/public-articles/index.html"),
        detail: resolve(root, "desktop/pages/public-detail/index.html"),
        admin: resolve(root, "desktop/pages/admin-home/index.html"),
        adminNew: resolve(root, "desktop/pages/admin-article-new/index.html"),
        adminEdit: resolve(root, "desktop/pages/admin-article-edit/index.html"),
        adminEditorGuide: resolve(
          root,
          "desktop/pages/admin-editor-guide/index.html",
        ),
        adminTypes: resolve(
          root,
          "desktop/pages/admin-article-types/index.html",
        ),
        adminTerms: resolve(root, "desktop/pages/admin-terms/index.html"),
        mobileHome: resolve(root, "mobile/pages/home/index.html"),
        mobileArticles: resolve(root, "mobile/pages/articles/index.html"),
        mobileDetail: resolve(root, "mobile/pages/article-detail/index.html"),
        mobileSettings: resolve(root, "mobile/pages/settings/index.html"),
      },
    },
  },
  server: {
    proxy: { "/api": apiOrigin },
  },
});
