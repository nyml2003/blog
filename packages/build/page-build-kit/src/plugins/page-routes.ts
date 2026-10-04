import type { Plugin } from "vite";

export function pageRoutesPlugin(routes: ReadonlyMap<string, string>): Plugin {
  return {
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
  };
}
