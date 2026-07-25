import { SOURCE_DIRECTORY, MANUAL_SOURCE_HEALTH } from "../../scraper/directory.mjs";

const config = () => {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("database_not_configured");
  return { url: url.replace(/\/$/, ""), key };
};

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const { url, key } = config();
  const auth = key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {};
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      ...auth,
      "Content-Type": "application/json",
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`supabase_${response.status}:${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const numberOrNull = (value) => value == null ? null : Number(value);

const camelListing = (row) => ({
  id: row.id,
  canonicalKey: row.canonical_key,
  source: row.source,
  sourceTier: row.source_tier,
  externalId: row.external_id,
  url: row.url,
  title: row.title,
  propertyName: row.property_name,
  address: row.address,
  city: row.city,
  state: row.state,
  zip: row.zip,
  neighborhood: row.neighborhood,
  suite: row.suite,
  latitude: numberOrNull(row.latitude),
  longitude: numberOrNull(row.longitude),
  propertyType: row.property_type,
  minSf: numberOrNull(row.min_sf),
  maxSf: numberOrNull(row.max_sf),
  availableSf: numberOrNull(row.available_sf),
  askingRateRaw: row.asking_rate_raw,
  baseRatePsfYear: numberOrNull(row.base_rate_psf_year),
  nnnPsfYear: numberOrNull(row.nnn_psf_year),
  estimatedMonthly: numberOrNull(row.estimated_monthly),
  rateConfidence: row.rate_confidence,
  leaseType: row.lease_type,
  availableDate: row.available_date,
  features: row.features || [],
  imageUrl: row.image_url,
  description: row.description,
  broker: row.broker,
  company: row.company,
  qualityScore: row.quality_score,
  qualityReasons: row.quality_reasons || [],
  status: row.status,
  firstSeen: row.first_seen,
  lastSeen: row.last_seen,
  sourceUpdatedAt: row.source_updated_at,
  missedRuns: row.missed_runs || 0
});

const snakeListing = (listing) => ({
  source: listing.source,
  source_tier: listing.sourceTier,
  external_id: listing.externalId,
  canonical_key: listing.canonicalKey,
  url: listing.url,
  title: listing.title,
  property_name: listing.propertyName,
  address: listing.address,
  city: listing.city,
  state: listing.state,
  zip: listing.zip,
  neighborhood: listing.neighborhood,
  suite: listing.suite,
  latitude: listing.latitude,
  longitude: listing.longitude,
  property_type: listing.propertyType,
  min_sf: listing.minSf,
  max_sf: listing.maxSf,
  available_sf: listing.availableSf,
  asking_rate_raw: listing.askingRateRaw,
  base_rate_psf_year: listing.baseRatePsfYear,
  nnn_psf_year: listing.nnnPsfYear,
  estimated_monthly: listing.estimatedMonthly,
  rate_confidence: listing.rateConfidence,
  lease_type: listing.leaseType,
  available_date: listing.availableDate,
  features: listing.features || [],
  image_url: listing.imageUrl,
  description: listing.description,
  broker: listing.broker,
  company: listing.company,
  quality_score: listing.qualityScore || 0,
  quality_reasons: listing.qualityReasons || [],
  status: listing.status === "new" ? "active" : listing.status,
  first_seen: listing.firstSeen,
  last_seen: listing.lastSeen,
  source_updated_at: listing.sourceUpdatedAt,
  missed_runs: listing.missedRuns || 0,
  raw: listing.raw || {},
  updated_at: new Date().toISOString()
});

const camelSource = (row) => ({
  source: row.source,
  tier: row.tier,
  status: row.status,
  recordCount: row.record_count || 0,
  attemptedAt: row.attempted_at,
  message: row.message || "",
  searchUrl: SOURCE_DIRECTORY.find((item) => item.name === row.source)?.searchUrl || ""
});

export const databaseConfigured = () => {
  try { config(); return true; } catch { return false; }
};

export async function getAllCurrentListings() {
  const rows = await request("retail_space_listings?select=*&status=in.(active,stale)&order=last_seen.desc&limit=2000");
  return (rows || []).map(camelListing);
}

export async function getDashboard() {
  const [listings, sourceRows] = await Promise.all([
    getAllCurrentListings(),
    request("retail_space_source_runs?select=*&order=attempted_at.desc&limit=200")
  ]);
  const latest = new Map();
  for (const row of sourceRows || []) {
    if (!latest.has(row.source)) latest.set(row.source, camelSource(row));
  }
  return {
    generatedAt: [...latest.values()].map((source) => source.attemptedAt).sort().at(-1) || null,
    cadenceHours: 6,
    market: "Seattle, WA",
    listings,
    sources: [...latest.values(), ...MANUAL_SOURCE_HEALTH],
    directory: SOURCE_DIRECTORY
  };
}

export async function upsertListings(listings) {
  for (let index = 0; index < listings.length; index += 100) {
    await request("retail_space_listings?on_conflict=canonical_key", {
      method: "POST",
      body: listings.slice(index, index + 100).map(snakeListing),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
    });
  }
}

export async function recordSourceRun(run) {
  await request("retail_space_source_runs", {
    method: "POST",
    body: {
      source: run.source,
      tier: run.tier,
      status: run.status,
      record_count: run.recordCount || 0,
      attempted_at: run.attemptedAt,
      completed_at: new Date().toISOString(),
      message: run.message || ""
    },
    headers: { Prefer: "return=minimal" }
  });
}

export async function acquireLease(owner, seconds = 300) {
  const rows = await request("rpc/acquire_retail_space_refresh_lease", {
    method: "POST",
    body: { p_owner: owner, p_lease_seconds: seconds }
  });
  return rows === true;
}

export async function releaseLease(owner) {
  await request("rpc/release_retail_space_refresh_lease", {
    method: "POST",
    body: { p_owner: owner }
  });
}
