import { z } from "zod";
import type { Client } from "../api-client";
import { CLIENT_API_ROUTES } from "../routes-contract";
import { getPath, postBody, type ClientRequest } from "../request-kit";

/** 管理端会话：登录与登出。 */
export const createAdminSessionApi = (
  request: ClientRequest,
): Pick<Client, "adminSession"> => ({
  adminSession: {
    login: (input) =>
      request<undefined>(
        CLIENT_API_ROUTES.adminSessionCreate.endpoint,
        z.unknown().transform(() => undefined),
        CLIENT_API_ROUTES.adminSessionCreate.method,
        postBody(CLIENT_API_ROUTES.adminSessionCreate, input),
      ),
    logout: () =>
      request<undefined>(
        getPath(CLIENT_API_ROUTES.adminSessionDelete, {}),
        z.unknown().transform(() => undefined),
        CLIENT_API_ROUTES.adminSessionDelete.method,
      ),
  },
});
