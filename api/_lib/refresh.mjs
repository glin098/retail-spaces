import crypto from "node:crypto";
import { normalizeListing } from "../../scraper/lib.mjs";
import { fetchCraigslist } from "../../scraper/sources/craigslist.mjs";
import { fetchCannon } from "../../scraper/sources/cannon.mjs";
import { fetchPikePlace } from "../../scraper/sources/pike-place.mjs";
import { fetchSeattleRestored } from "../../scraper/sources/seattle-restored.mjs";
import { acquireLease, getAllCurrentListings, recordSourceRun, releaseLease, upsertListings } from "./db.mjs";

const STALE_AFTER_HEALTHY_MISSES = 4;
const EXPIRE_AFTER_HEALTHY_MISSES = 28;

export function mergeRefresh(existingListings, sourceRuns, capturedAt) {
  const existingByKey = new Map(existingListings.map((listing) => [listing.canonicalKey, listing]));
  // Begin with the current snapshot so a blocked, empty, failed, or unrelated
  // source can never make inventory disappear.
  const updates = [...existingListings];
  for (const run of sourceRuns) {
    const seen = new Set();
    for (const raw of run.records || []) {
      const previous = existingByKey.get(raw.canonicalKey);
      seen.add(raw.canonicalKey);
      updates.push(normalizeListing({
        ...raw,
        status: "active",
        firstSeen: previous?.firstSeen || raw.firstSeen || capturedAt,
        lastSeen: capturedAt,
        missedRuns: 0
      }, capturedAt));
    }
    if (run.status !== "healthy") continue;
    for (const previous of existingListings) {
      if (previous.source !== run.source || seen.has(previous.canonicalKey)) continue;
      const missedRuns = Number(previous.missedRuns || 0) + 1;
      updates.push({
        ...previous,
        missedRuns,
        status: missedRuns >= EXPIRE_AFTER_HEALTHY_MISSES
          ? "expired"
          : missedRuns >= STALE_AFTER_HEALTHY_MISSES
            ? "stale"
            : "active"
      });
    }
  }
  return [...new Map(updates.map((listing) => [listing.canonicalKey, listing])).values()];
}

export async function refreshInventory() {
  const owner = crypto.randomUUID();
  if (!(await acquireLease(owner, 300))) {
    return { ok: true, skipped: true, reason: "another_refresh_is_running" };
  }
  const capturedAt = new Date().toISOString();
  try {
    const [existing, sourceRuns] = await Promise.all([
      getAllCurrentListings(),
      Promise.all([
        fetchCraigslist(capturedAt),
        fetchCannon(capturedAt),
        fetchPikePlace(capturedAt),
        fetchSeattleRestored(capturedAt)
      ])
    ]);
    const updates = mergeRefresh(existing, sourceRuns, capturedAt);
    await upsertListings(updates);
    await Promise.all(sourceRuns.map(recordSourceRun));
    return {
      ok: true,
      skipped: false,
      capturedAt,
      upserted: updates.length,
      sources: sourceRuns.map(({ source, tier, status, recordCount, message }) => ({
        source, tier, status, recordCount, message
      }))
    };
  } finally {
    await releaseLease(owner).catch(() => {});
  }
}
