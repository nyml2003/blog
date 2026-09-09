import assert from "node:assert/strict";
import test from "node:test";
import {
  configureSiteRoutes,
  siteRouteRequired,
  siteRoutesReady,
  withQuery,
} from "./site-routes";

test("siteRouteRequired reads only configured manifest values", () => {
  assert.equal(siteRoutesReady(), false);
  assert.throws(
    () => siteRouteRequired("mobile-home"),
    /site route not available: mobile-home/,
  );

  configureSiteRoutes({ "mobile-home": "/m/" });
  assert.equal(siteRoutesReady(), true);
  assert.equal(siteRouteRequired("mobile-home"), "/m/");
  assert.throws(
    () => siteRouteRequired("unknown-key"),
    /site route not available: unknown-key/,
  );
});

test("withQuery composes paths with query parameters", () => {
  assert.equal(
    withQuery("/articles/detail.html", { id: 7 }),
    "/articles/detail.html?id=7",
  );
  assert.equal(
    withQuery("/admin/articles/edit.html", { id: "3", kind: "" }),
    "/admin/articles/edit.html?id=3",
  );
  assert.equal(withQuery("/m/", {}), "/m/");
});
