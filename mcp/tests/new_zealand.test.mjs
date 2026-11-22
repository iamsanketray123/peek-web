import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchHints } from "../../src/lib/aso/suggest.ts";

test("New Zealand autocomplete uses its own storefront instead of the US fallback", async () => {
  const originalFetch = globalThis.fetch;
  let storefront;
  globalThis.fetch = async (_url, options) => {
    storefront = options.headers["X-Apple-Store-Front"];
    return new Response("<plist><key>term</key><string>medicine reminder</string></plist>");
  };
  try {
    assert.deepEqual(await fetchHints("medicine", "nz"), ["medicine reminder"]);
    assert.equal(storefront, "143461,29");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Portugal autocomplete uses its own storefront instead of the US fallback", async () => {
  const originalFetch = globalThis.fetch;
  let storefront;
  globalThis.fetch = async (_url, options) => {
    storefront = options.headers["X-Apple-Store-Front"];
    return new Response("<plist><key>term</key><string>planner</string></plist>");
  };
  try {
    assert.deepEqual(await fetchHints("planner", "pt"), ["planner"]);
    assert.equal(storefront, "143453,29");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
