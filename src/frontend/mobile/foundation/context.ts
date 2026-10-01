import {
  type AsyncPersistencePort,
  type DocumentPort,
  type NavigationPort,
  type PersistencePort,
  type SchedulerPort,
  type SpaceTimePort,
  type ViewportPort,
  type OperationIdPort,
} from "@fluvient-loom/port";
import { type DataResource } from "@fluvient-loom/query";
import type { MobileApi, SiteRoutes } from "./api";

export interface MobileRouteContext {
  readonly routes: SiteRoutes;
}

export interface MobilePageContext {
  readonly api: MobileApi;
  readonly routes: SiteRoutes;
  readonly persistence: PersistencePort;
  readonly asyncPersistence: AsyncPersistencePort;
  readonly operationId: OperationIdPort;
  readonly scheduler: SchedulerPort;
  readonly spaceTime: SpaceTimePort;
  readonly navigation: NavigationPort;
  readonly document: DocumentPort;
  readonly viewport: ViewportPort;
  readonly share: (url: string) => Promise<void>;
}

export function route(routes: SiteRoutes, id: string): string {
  const value = routes.routes[id];
  if (value === undefined || value === "") {
    throw new Error(`site route not available: ${id}`);
  }
  return value;
}

export function routeWithQuery(
  routes: SiteRoutes,
  id: string,
  parameters: Readonly<Record<string, string | number>>,
): string {
  const pathValue = route(routes, id);
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters))
    search.set(key, String(value));
  const query = search.toString();
  return query === "" ? pathValue : `${pathValue}?${query}`;
}

export type MobileResource<T, E> = DataResource<T, E>;
