import assert from "node:assert/strict";
import test from "node:test";
import { createMobileApi } from "../../../app/habitat/api/mobile";
import { ok } from "../../../app/kernel/result";
import type {
  NetworkPort,
  NetworkRequest,
  NetworkResponse,
} from "../../../app/kernel/ports";

function network(response: NetworkResponse): NetworkPort {
  return {
    request(_request: NetworkRequest) {
      return Promise.resolve(ok(response));
    },
  };
}

function body(data: unknown, code = "OK") {
  return { code, message: code === "OK" ? "" : "remote failure", data };
}

test("mobile API decodes the existing envelope and keeps endpoint ownership in L2", async () => {
  let requestPath = "";
  const client = createMobileApi({
    request(request) {
      requestPath = request.path;
      return Promise.resolve(
        ok({
          status: 200,
          headers: {},
          body: body({
            filters: [{ id: "all", name: "全部" }],
            selectedFilterId: "all",
            articles: [],
            total: 0,
          }),
        }),
      );
    },
  });

  const result = await client.tShelf
    .get({ surface: "recommendation", filterId: "all" })
    .start();
  assert.deepEqual(result, {
    ok: true,
    value: {
      filters: [{ id: "all", name: "全部" }],
      selectedFilterId: "all",
      articles: [],
      total: 0,
    },
  });
  assert.equal(
    requestPath,
    "/api/public/t-shelf?sceneCode=public.t_shelf&surface=recommendation&filter_id=all",
  );
});

test("mobile API turns remote failures into failed Results", async () => {
  const result = await createMobileApi(
    network({
      status: 503,
      headers: {},
      body: body({}, "SERVICE_UNAVAILABLE"),
    }),
  )
    .siteRoutes.get()
    .start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "remote");
  assert.equal(result.error.status, 503);
  assert.equal(result.error.code, "SERVICE_UNAVAILABLE");
});

test("mobile API rejects invalid Zod payloads as protocol failures", async () => {
  const result = await createMobileApi(
    network({
      status: 200,
      headers: {},
      body: body({
        filters: [],
        selectedFilterId: "all",
        articles: [{ id: "not-an-id" }],
        total: 1,
      }),
    }),
  )
    .tShelf.get({ surface: "archive", filterId: "all" })
    .start();
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.kind, "protocol");
  assert.ok(result.error.issues?.some((issue) => issue.includes("articles")));
});
