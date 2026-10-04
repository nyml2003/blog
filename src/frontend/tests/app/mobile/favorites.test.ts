import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryPersistence } from "@fluvient-loom/node";
import {
  createFavoriteStore,
  mobileFavoritesKey,
} from "@blog/page-mobile-detail/favorites";

test("favorite toggle persists and restores article ids", () => {
  const persistence = createMemoryPersistence();
  const store = createFavoriteStore(persistence);

  assert.equal(store.has("article-42"), false);
  assert.equal(store.toggle("article-42").ok, true);
  assert.equal(store.has("article-42"), true);
  const persisted = persistence.read(mobileFavoritesKey);
  assert.equal(persisted.ok, true);
  if (!persisted.ok) return;
  assert.equal(persisted.value, JSON.stringify({ "article-42": true }));

  const restored = createFavoriteStore(persistence);
  assert.equal(restored.has("article-42"), true);
  assert.equal(restored.toggle("article-42").ok, true);
  assert.equal(restored.has("article-42"), false);
});
