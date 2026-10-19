import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "./itunes" ? "./itunes.ts" : specifier, context);
  },
});
const { parseAppStoreReviews, fetchReviews, summarize } = await import("../src/lib/aso/reviews.ts");
const review = { $kind: "Review", id: "123", rating: 5, title: "Great", contents: "Actual written review", reviewerName: "Reader", date: "2026-10-17T00:00:00Z" };
const page = (items) => `<script type="application/json" id="serialized-server-data">${JSON.stringify({ data: items })}</script>`;

test("parses and deduplicates public-page reviews without executing HTML", () => {
  const result = parseAppStoreReviews(page([review, { review }, { ...review, id: "invalid", rating: 6 }]));
  assert.equal(result.length, 1);
  assert.equal(result[0].content, review.contents);
  assert.equal(result[0].source, "app-store-page");
  assert.equal(summarize(result).average, 5);
});

test("valid empty page is empty, broken page is an error", () => {
  assert.deepEqual(parseAppStoreReviews(page([])), []);
  assert.throws(() => parseAppStoreReviews("<html>Blocked</html>"), /format changed/);
});

test("empty RSS falls back to the same storefront's product page", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response(url.includes("itunes.apple.com") ? JSON.stringify({ feed: {} }) : page([review]));
  };
  try {
    assert.equal((await fetchReviews("6777777931", "us")).length, 1);
    assert.equal(calls[1], "https://apps.apple.com/us/app/id6777777931");
  } finally { globalThis.fetch = originalFetch; }
});

test("nonempty RSS keeps existing review metadata and does not fetch page", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ feed: { entry: { id: { label: "rss" }, "im:rating": { label: "4" }, content: { label: "RSS review" } } } });
  };
  try {
    const result = await fetchReviews("123", "gb");
    assert.equal(result[0].id, "rss");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
