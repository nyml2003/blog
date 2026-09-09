import type { Client, SiteRoutes } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import { getPath, siteRoutesSchema, type ClientRequest } from "../request-kit";

/** 页面路由清单（SPEC-SITE-ROUTES-001）。 */
export const createSiteRoutesApi = (
  request: ClientRequest,
): Pick<Client, "siteRoutes"> => ({
  siteRoutes: {
    get: () =>
      request<SiteRoutes>(
        getPath(CLIENT_API_ROUTES.publicSiteRoutes, {}),
        siteRoutesSchema,
        CLIENT_API_ROUTES.publicSiteRoutes.method,
      ),
  },
});
