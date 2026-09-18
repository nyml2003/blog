import type {
  DataResource,
  AsyncPersistencePort,
  DocumentPort,
  NavigationPort,
  PersistencePort,
  SchedulerPort,
  SpaceTimePort,
  ViewportPort,
  OperationIdPort,
} from "../../kernel";
import type { MobileApi, SiteRoutes } from "../api/mobile";

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
}

export function route(routes: SiteRoutes, id: string): string {
  const value = routes.routes[id];
  if (value === undefined || value === "") {
    throw new Error(`site route not available: ${id}`);
  }
  return value;
}

export type MobileResource<T, E> = DataResource<T, E>;
