import type { Accessor } from "solid-js";
import type {
  ArticleFilterInput,
  ArticleId,
  Client,
} from "../../common/client";
import { browserClient } from "../../common/client";
import type { ArticleFilter } from "../../common/contracts/domain";
import type { DataError } from "../../common/data/errors";
import type { DeepReadonly } from "../../common/data/readonly";
import { err, type Result } from "../../common/data/result";
import { createDataTask, type DataTask } from "../../common/data/task";
import { useDataResource } from "../data";

export type QueryClient = Client;
export type QueryError = DataError;
export type QueryResult<T> = Result<DeepReadonly<T>, QueryError>;
export type QueryTask<T> = DataTask<T, QueryError>;
export type QueryInput<T> = Accessor<T>;
export type QueryReadonly<T> = DeepReadonly<T>;

export const queryClient = browserClient;

export const articleFilterInput = (
  filter: ArticleFilter,
): ArticleFilterInput => ({
  termIds: filter.termIds.map(Number),
  typeId: Number(filter.typeId) || undefined,
  createdFrom: filter.createdFrom || undefined,
  createdTo: filter.createdTo || undefined,
  updatedFrom: filter.updatedFrom || undefined,
  updatedTo: filter.updatedTo || undefined,
});

export const positiveArticleId = (
  rawId: string | null | undefined,
): ArticleId | undefined => {
  if (rawId === null || rawId === undefined || !/^\d+$/.test(rawId)) {
    return undefined;
  }
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return undefined;
  return id as ArticleId;
};

export const failedQuery = <T>(message: string): QueryTask<T> =>
  createDataTask(async () =>
    err({
      kind: "protocol",
      message,
    }),
  );

export const taskForArticleId = <T>(
  rawId: string | null | undefined,
  task: (id: ArticleId) => QueryTask<T>,
): QueryTask<T> => {
  const id = positiveArticleId(rawId);
  return id === undefined ? failedQuery("缺少或无效的文章 ID") : task(id);
};

export const startQuery = <T>(task: QueryTask<T>): Promise<QueryResult<T>> =>
  task.start();

export { useDataResource };
