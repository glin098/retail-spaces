import assert from "node:assert/strict";
import test from "node:test";
import { mergeRefresh } from "../api/_lib/refresh.mjs";
import { normalizeListing } from "../scraper/lib.mjs";

const capturedAt = "2026-07-25T06:00:00.000Z";
const existing = normalizeListing({
  source: "Example",
  externalId: "one",
  canonicalKey: "example:one",
  url: "https://example.com/one",
  title: "Retail Space",
  firstSeen: "2026-07-20T00:00:00.000Z",
  lastSeen: "2026-07-25T00:00:00.000Z",
  missedRuns: 3
}, capturedAt);

test("blocked and empty source runs never age listings", () => {
  const [blocked] = mergeRefresh([existing], [{
    source: "Example", status: "blocked", records: []
  }], capturedAt);
  const [empty] = mergeRefresh([existing], [{
    source: "Example", status: "empty", records: []
  }], capturedAt);
  assert.equal(blocked.lastSeen, existing.lastSeen);
  assert.equal(blocked.missedRuns, existing.missedRuns);
  assert.equal(empty.lastSeen, existing.lastSeen);
  assert.equal(empty.missedRuns, existing.missedRuns);
});

test("healthy confirmed misses move a listing to stale conservatively", () => {
  const [updated] = mergeRefresh([existing], [{
    source: "Example", status: "healthy", records: []
  }], capturedAt);
  assert.equal(updated.missedRuns, 4);
  assert.equal(updated.status, "stale");
  assert.equal(updated.lastSeen, existing.lastSeen);
});

test("a seen listing preserves first seen and resets misses", () => {
  const fresh = normalizeListing({
    source: "Example",
    externalId: "one",
    canonicalKey: "example:one",
    url: "https://example.com/one",
    title: "Updated Retail Space"
  }, capturedAt);
  const [updated] = mergeRefresh([existing], [{
    source: "Example", status: "healthy", records: [fresh]
  }], capturedAt);
  assert.equal(updated.firstSeen, "2026-07-20T00:00:00.000Z");
  assert.equal(updated.lastSeen, capturedAt);
  assert.equal(updated.missedRuns, 0);
  assert.equal(updated.status, "active");
});
