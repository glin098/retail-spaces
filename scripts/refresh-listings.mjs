import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SOURCE_DIRECTORY, MANUAL_SOURCE_HEALTH } from "../scraper/directory.mjs";
import { fetchCannon } from "../scraper/sources/cannon.mjs";
import { fetchCraigslist } from "../scraper/sources/craigslist.mjs";
import { fetchPikePlace } from "../scraper/sources/pike-place.mjs";
import { fetchSeattleRestored } from "../scraper/sources/seattle-restored.mjs";
import { mergeRefresh } from "../api/_lib/refresh.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const capturedAt = new Date().toISOString();

async function main() {
  if ((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { refreshInventory } = await import("../api/_lib/refresh.mjs");
    const result = await refreshInventory();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const runs = await Promise.all([
    fetchCraigslist(capturedAt),
    fetchCannon(capturedAt),
    fetchPikePlace(capturedAt),
    fetchSeattleRestored(capturedAt)
  ]);
  const output = path.resolve(dirname, "../src/data/listings.json");
  let previous = { listings: [] };
  try {
    previous = JSON.parse(await fs.readFile(output, "utf8"));
  } catch {
    // The first local refresh starts from an empty fallback snapshot.
  }
  const listings = mergeRefresh(previous.listings || [], runs, capturedAt)
    .filter((listing) => listing.status !== "expired")
    .sort((a, b) => b.qualityScore - a.qualityScore || Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
  const snapshot = {
    generatedAt: capturedAt,
    cadenceHours: 6,
    market: "Seattle, WA",
    listings,
    sources: [
      ...runs.map(({ records: _records, ...run }) => run),
      ...MANUAL_SOURCE_HEALTH
    ],
    directory: SOURCE_DIRECTORY
  };
  await fs.writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "snapshot-fallback",
    output,
    listings: listings.length,
    sources: runs.map(({ source, status, recordCount }) => ({ source, status, recordCount }))
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
