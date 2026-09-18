import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryPersistence,
  createNodeOperationId,
  createNodeScheduler,
} from "@fluvient-loom/node";
import { createDemoApp } from "../src/app";

function harness() {
  const persistence = createMemoryPersistence();
  const app = createDemoApp({
    persistence,
    scheduler: createNodeScheduler(),
    operationIds: createNodeOperationId(),
  });
  return { app, persistence };
}

test("reads flow through the mock server and requester", async () => {
  const { app } = harness();
  const recommendations = await app.fetchRecommendations();
  assert.equal(recommendations.ok, true);
  assert.ok(recommendations.ok);
  assert.equal(recommendations.value.length, 3);
  assert.equal(recommendations.value[0].id, 1);

  const list = await app.fetchList();
  assert.ok(list.ok);
  assert.equal(list.value.length, 10);

  const article = await app.fetchArticle(3);
  assert.ok(article.ok);
  assert.equal(article.value.tag, "导航");
  assert.equal(article.value.paragraphs.length, 3);

  const missing = await app.fetchArticle(999);
  assert.equal(missing.ok, false);
});

test("related articles exclude the current one and come as list items", async () => {
  const { app } = harness();
  const related = await app.fetchRelated(3);
  assert.equal(related.ok, true);
  assert.ok(related.ok);
  assert.equal(related.value.length, 4);
  assert.equal(
    related.value.some((item) => item.id === 3),
    false,
    "the current article never recommends itself",
  );
});

test("favorites reconcile adopts the server truth on boot", async () => {
  const { app } = harness();
  assert.deepEqual(app.favorites.state().value, { ids: [] }, "cold restore");
  await app.favorites.reconcile();
  assert.deepEqual(app.favorites.state().value, { ids: [4] });
});

test("favorite toggle writes through; injected 500 rolls back then retry settles", async () => {
  const { app } = harness();
  await app.favorites.reconcile();

  const first = await app.toggleFavorite(5);
  assert.deepEqual(first, { ok: true, value: undefined });
  assert.deepEqual(app.server.favoriteIds(), [4, 5]);

  app.server.failNextFavorite();
  const failed = await app.toggleFavorite(1);
  assert.equal(failed.ok, false);
  assert.equal(app.favorites.state().status, "error");
  assert.deepEqual(app.server.favoriteIds(), [4, 5], "server unchanged");
  assert.deepEqual(app.favorites.state().value.ids, [4, 5], "rolled back");

  await Promise.resolve();
  const retried = await app.favorites.retry();
  assert.deepEqual(retried, { ok: true, value: undefined });
  assert.deepEqual(app.server.favoriteIds(), [4, 5, 1]);
});

test("a fresh app restores the cached favorites (refresh semantics)", async () => {
  const { app, persistence } = harness();
  await app.favorites.reconcile();
  await app.toggleFavorite(7);

  const refreshed = createDemoApp({
    persistence,
    scheduler: createNodeScheduler(),
    operationIds: createNodeOperationId(),
  });
  assert.deepEqual(
    refreshed.favorites.state().value.ids,
    [4, 7],
    "restore replays the last projected favorites from the cache",
  );
});
