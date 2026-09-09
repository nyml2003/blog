import { z } from "zod";
import type { ContentTaxonomy } from "./domain";
import type { DataError } from "../data/errors";
import { err, ok, type Result } from "../data/result";
import type { DataTask } from "../data/task";
import type { ClientApiRoute } from "./routes-contract";

/**
 * 请求基础设施（A 形态：多导出、成员彼此独立）：zod schema、decode、
 * 路径/请求体构造。领域分组从这里取得共享工具，避免与组合根形成环。
 */

export type ClientRequest = <T>(
  path: string,
  schema: z.ZodType<T>,
  method?: "GET" | "POST" | "DELETE",
  body?: unknown,
) => DataTask<T>;

export const typeSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
});
export const termSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  kind: z.enum(["topic", "tag"]),
});
export const shelfSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      // 分区截断前的全量条数（`type-<id>` 分区即该类型的全量计数）。
      total: z.number().int().nonnegative(),
      articles: z.array(
        z.object({
          id: z.number().int().positive(),
          title: z.string(),
          summary: z.string(),
          updatedAt: z.string(),
          terms: z.array(termSchema),
        }),
      ),
    }),
  ),
  total: z.number().int().nonnegative(),
  hasFilters: z.boolean(),
  warnings: z.array(z.string()),
});
export const tShelfSchema = z.object({
  filters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  selectedFilterId: z.string(),
  articles: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      summary: z.string(),
      updatedAt: z.string(),
      terms: z.array(termSchema),
    }),
  ),
  total: z.number().int().nonnegative(),
});

export const siteRoutesSchema = z.object({
  routes: z.record(z.string(), z.string()),
});

export function decode<T>(
  schema: z.ZodType<T>,
  value: unknown,
): Result<T, DataError> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err({
        kind: "protocol",
        message: "响应数据格式不符合协议",
        issues: parsed.error.issues.map(
          (issue) => issue.path.join(".") || issue.message,
        ),
      });
}

export const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, value);
  return search.toString();
};

export const getPath = (
  route: ClientApiRoute,
  params: Record<string, string | undefined>,
) => `${route.endpoint}?${query({ sceneCode: route.sceneCode, ...params })}`;

export const postBody = (
  route: ClientApiRoute,
  fields: Record<string, unknown>,
) => ({
  sceneCode: route.sceneCode,
  ...fields,
});

export const contentTaxonomyBody = (taxonomy: ContentTaxonomy) => ({
  ...taxonomy,
  categories: taxonomy.categories.map((category) => ({
    ...category,
    parentId: category.parentId ?? null,
  })),
});
