/**
 * Demo app assembly — pure port wiring, testable under Node with injected
 * adapters. main.ts adds DOM bindings only.
 *
 * Features exercised: mock network + json requester (reads), the lifecycle
 * factory over favorites (restore from cache / reconcile from server /
 * optimistic write with rollback + retry), and a hand-rolled view stack on
 * top of NavigationPort (system back gesture rides popstate).
 */
import { err, ok, type Result } from "@fluvient-loom/common";
import {
  createPersistentDesiredState,
  type PersistentDesiredState,
} from "@fluvient-loom/command";
import { createDataTask } from "@fluvient-loom/query";
import {
  createJsonRequester,
  type DocumentPort,
  type JsonRequester,
  type NetworkPort,
  type OperationIdPort,
  type PersistencePort,
  type SchedulerPort,
} from "@fluvient-loom/port";
import { createMockNetwork } from "@fluvient-loom/mock";
import { createDemoServer, type DemoArticle } from "./server";

export type { DemoArticle, DemoRecommendation } from "./server";

export interface DemoFavorites {
  readonly ids: readonly number[];
}

export interface DemoError {
  readonly kind: "demo";
  readonly message: string;
}

const demoError = (message: string): DemoError => ({ kind: "demo", message });

const FAVORITES_KEY = "playground.favorites.v1";

export interface DemoListItem {
  readonly id: number;
  readonly title: string;
  readonly summary: string;
  readonly tag: string;
}

export interface DemoRecommendationItem extends DemoListItem {
  readonly reason: string;
}

function parseIds(raw: unknown): readonly number[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !Array.isArray((raw as { ids?: unknown }).ids)
  ) {
    return [];
  }
  return ((raw as { ids: unknown[] }).ids).filter(
    (id): id is number => typeof id === "number",
  );
}

export interface DemoDependencies {
  readonly network?: NetworkPort;
  readonly persistence: PersistencePort;
  readonly scheduler: SchedulerPort;
  readonly operationIds: OperationIdPort;
  readonly document?: DocumentPort;
  readonly onFavorites?: (favorites: DemoFavorites) => void;
}

export interface DemoApp {
  readonly requester: JsonRequester;
  readonly server: ReturnType<typeof createDemoServer>;
  readonly favorites: PersistentDesiredState<DemoFavorites, DemoError>;
  fetchRecommendations(): Promise<
    Result<readonly DemoRecommendationItem[], DemoError>
  >;
  fetchList(): Promise<Result<readonly DemoListItem[], DemoError>>;
  fetchArticle(id: number): Promise<Result<DemoArticle, DemoError>>;
  fetchRelated(id: number): Promise<Result<readonly DemoListItem[], DemoError>>;
  toggleFavorite(id: number): Promise<Result<void, DemoError>>;
}

export function createDemoApp(deps: DemoDependencies): DemoApp {
  const server = createDemoServer();
  const network: NetworkPort =
    deps.network ?? createMockNetwork(server.routes, { scheduler: deps.scheduler });
  const requester = createJsonRequester(network);

  const messageOf = (error: { kind: string; message?: string }) =>
    error.kind === "cancelled" ? "cancelled" : (error.message ?? error.kind);

  const favorites = createPersistentDesiredState<DemoFavorites, DemoError>({
    disposedError: demoError("disposed"),
    persistence: deps.persistence,
    restore: (persistence) => {
      const read = persistence.read(FAVORITES_KEY);
      if (!read.ok || read.value === undefined) return { ids: [] };
      return { ids: parseIds(JSON.parse(read.value)) };
    },
    reconcileTask: () =>
      createDataTask({
        execute: async (signal) => {
          const response = await requester.get("/favorites", { signal });
          if (!response.ok) return err(demoError(messageOf(response.error)));
          return ok({ ids: parseIds(response.value.body) });
        },
        mapRejected: (cause) => demoError(String(cause)),
      }),
    scheduler: deps.scheduler,
    operationIds: deps.operationIds,
    command: {
      kind: "atomic",
      async prepare(input) {
        return ok({
          async execute() {
            const response = await requester.post("/favorites", {
              ids: input.next.ids,
            });
            if (!response.ok) return err(demoError(messageOf(response.error)));
            if (response.value.status !== 200) {
              return err(demoError(`server rejected: ${response.value.status}`));
            }
            return ok(undefined);
          },
          async compensate() {
            return ok(undefined);
          },
        });
      },
    },
    project: (value) => {
      deps.persistence.write(FAVORITES_KEY, JSON.stringify(value));
      deps.onFavorites?.(value);
    },
  });

  const decodeList = (
    body: unknown,
  ): readonly { id: number; title: string; summary: string; tag: string }[] => {
    if (!Array.isArray(body)) return [];
    return body.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== "number") return [];
      return [
        {
          id: candidate.id,
          title: typeof candidate.title === "string" ? candidate.title : "",
          summary:
            typeof candidate.summary === "string" ? candidate.summary : "",
          tag: typeof candidate.tag === "string" ? candidate.tag : "",
        },
      ];
    });
  };

  return {
    requester,
    server,
    favorites,
    async fetchRecommendations() {
      const response = await requester.get("/recommendations");
      if (!response.ok) return err(demoError(messageOf(response.error)));
      if (response.value.status !== 200) {
        return err(demoError(`recommendations failed: ${response.value.status}`));
      }
      const items = decodeList(
        (response.value.body as { article?: unknown }[] | undefined)?.map(
          (entry) => entry.article,
        ),
      );
      const reasons = Array.isArray(response.value.body)
        ? response.value.body
        : [];
      return ok(
        items.map((item, index) => ({
          ...item,
          reason:
            typeof (reasons[index] as { reason?: unknown })?.reason === "string"
              ? (reasons[index] as { reason: string }).reason
              : "",
        })),
      );
    },
    async fetchList() {
      const response = await requester.get("/articles");
      if (!response.ok) return err(demoError(messageOf(response.error)));
      if (response.value.status !== 200) {
        return err(demoError(`list failed: ${response.value.status}`));
      }
      return ok(decodeList(response.value.body));
    },
    async fetchArticle(id: number) {
      const response = await requester.get(`/articles/${id}`);
      if (!response.ok) return err(demoError(messageOf(response.error)));
      const body = response.value.body as Record<string, unknown>;
      if (response.value.status !== 200) {
        return err(demoError(`article failed: ${response.value.status}`));
      }
      return ok({
        id,
        title: typeof body.title === "string" ? body.title : "",
        summary: typeof body.summary === "string" ? body.summary : "",
        tag: typeof body.tag === "string" ? body.tag : "",
        paragraphs: Array.isArray(body.paragraphs)
          ? body.paragraphs.filter(
              (paragraph): paragraph is string =>
                typeof paragraph === "string",
            )
          : [],
      } satisfies DemoArticle);
    },
    async fetchRelated(id: number) {
      const response = await requester.get(`/articles/${id}/related`);
      if (!response.ok) return err(demoError(messageOf(response.error)));
      if (response.value.status !== 200) {
        return err(demoError(`related failed: ${response.value.status}`));
      }
      return ok(decodeList(response.value.body));
    },
    toggleFavorite(id: number) {
      const current = favorites.state().value.ids;
      const ids = current.includes(id)
        ? current.filter((favorite) => favorite !== id)
        : [...current, id];
      return favorites.update({ ids });
    },
  };
}
