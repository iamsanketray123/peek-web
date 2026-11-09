import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApp } from "../profiles.mjs";
import { SnapshotStore, compareSnapshots } from "../store.mjs";
import { PeekService } from "../service.mjs";

test("Dosey/Medo aliases resolve to the same verified ID; arbitrary paths are rejected", () => {
  assert.equal(resolveApp("Dosey").appleId, "6807894442");
  assert.equal(resolveApp("medo").appleId, resolveApp("dosey").appleId);
  assert.equal(resolveApp("https://apps.apple.com/us/app/example/id123").appleId, "123");
  assert.throws(() => resolveApp("../../secrets"));
});

test("rank checks record actual returned depth and preserve unknown positions", async () => {
  const service = new PeekService({ api: { searchApps: async () => [{ trackId: 6777777931, trackName: "Tether" }] } });
  const result = await service.ranks("tether", ["planner", "PLANNER"], "us", ["123"]);
  assert.equal(result.keywords.length, 1);
  assert.equal(result.keywords[0].position, 1);
  assert.equal(result.keywords[0].returnedCount, 1);
  assert.equal(result.keywords[0].competitors["123"], null);
  assert.match(result.caveat, /NOT verified/);
});

test("network failure is an error observation, not a missing rank", async () => {
  const service = new PeekService({ api: { searchApps: async () => { throw new Error("Rate limited"); } } });
  const result = await service.ranks("medo", ["pill reminder"], "us");
  assert.equal(result.complete, false);
  assert.equal(result.keywords[0].error, "Rate limited");
  assert.equal("position" in result.keywords[0], false);
});

test("deltas distinguish improvement, result-set entry and fetch errors", () => {
  const base = { appleId: "1", country: "us" };
  const before = { ...base, keywords: [{ term: "a", position: 9 }, { term: "b", position: null }, { term: "c", position: 1 }] };
  const now = { ...base, keywords: [{ term: "a", position: 4 }, { term: "b", position: 20 }, { term: "c", error: "failed" }] };
  const changes = compareSnapshots(now, before);
  assert.equal(changes[0].delta, 5);
  assert.equal(changes[1].status, "entered_returned_results");
  assert.equal(changes[1].delta, null);
  assert.equal(changes[2].status, "no_comparable_observation");
  assert.throws(() => compareSnapshots({ ...now, country: "in" }, before));
});

test("snapshots persist across service instances and remain country-scoped", async () => {
  const directory = await mkdtemp(join(tmpdir(), "peek-mcp-test-"));
  try {
    const api = { lookupApp: async () => ({ trackName: "Medo" }), searchApps: async () => [{ trackId: 6807894442 }] };
    const service = new PeekService({ store: new SnapshotStore(directory), api });
    const result = await service.capture("dosey", ["pill reminder"], "us");
    assert.equal(result.snapshot.keywords[0].position, 1);
    const restarted = new PeekService({ store: new SnapshotStore(directory), api });
    assert.equal((await restarted.history("medo", "us", 10)).snapshots.length, 1);
    assert.equal((await restarted.history("medo", "in", 10)).snapshots.length, 0);
    const failures = new PeekService({ store: new SnapshotStore(directory), api: { ...api, searchApps: async () => { throw new Error("offline"); } } });
    await assert.rejects(failures.capture("medo", ["pill reminder"], "us"), /no baseline was saved/);
    assert.equal((await restarted.history("medo", "us", 10)).snapshots.length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("review fallback provenance is preserved", async () => {
  const service = new PeekService({ api: { fetchReviews: async () => [{ id: "1", rating: 5, source: "app-store-page" }] } });
  const result = await service.reviews("tether", "us");
  assert.equal(result.source, "apple-app-store-page");
  assert.equal(result.summary.count, 1);
  assert.match(result.caveat, /untrusted/);
});
