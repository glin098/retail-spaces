import * as cheerio from "cheerio";
import { clean, fetchJson, fetchText, mapLimit, normalizeListing, sourceResult } from "../lib.mjs";

const SOURCE = "Craigslist";
const SEARCH_URL = "https://seattle.craigslist.org/search/see/off?query=retail&sort=date";
const API = "https://sapi.craigslist.org/web/v8/postings/search/full";
const QUERIES = ["retail", "storefront", "restaurant space"];

export function parseCraigslistPayload(payload, capturedAt = new Date().toISOString()) {
  const data = payload?.data || {};
  const decode = data.decode || {};
  const base = Number(decode.minPostingId || 0);
  const locations = decode.locationDescriptions || [];
  const host = data.location?.url || "seattle.craigslist.org";
  const subarea = data.params?.subarea || "see";
  const category = data.categoryAbbr || "off";
  const records = [];
  for (const item of (data.items || []).slice(0, 100)) {
    if (!Array.isArray(item) || !Number.isFinite(item[0])) continue;
    const id = String(base + item[0]);
    let slug = "listing";
    let price = null;
    let imageUrl = null;
    for (const value of item) {
      if (!Array.isArray(value)) continue;
      if (value[0] === 6 && typeof value[1] === "string") slug = value[1];
      if (value[0] === 10 && typeof value[1] === "string") price = value[1];
      if (value[0] === 4 && typeof value[1] === "string") {
        const token = value[1].split(":", 2).at(-1);
        if (token) imageUrl = `https://images.craigslist.org/${token}_600x450.jpg`;
      }
    }
    const title = item.filter((value) => typeof value === "string" && !value.includes("~"))
      .sort((a, b) => b.length - a.length)[0];
    if (!title) continue;
    let neighborhood = null;
    let latitude = null;
    let longitude = null;
    if (typeof item[4] === "string" && item[4].includes("~")) {
      const [head, lat, lng] = item[4].split("~");
      const locationIndex = Number(head.split(":").at(-1));
      neighborhood = clean(locations[locationIndex] || "") || null;
      latitude = Number(lat) || null;
      longitude = Number(lng) || null;
    }
    records.push(normalizeListing({
      source: SOURCE,
      sourceTier: "public-api",
      externalId: id,
      canonicalKey: `craigslist:${id}`,
      url: `https://${host}/${subarea}/${category}/d/${slug}/${id}.html`,
      title,
      city: "Seattle",
      state: "WA",
      neighborhood,
      latitude,
      longitude,
      askingRateRaw: price ? `${price}/month (listing headline)` : null,
      estimatedMonthly: price ? Number(price.replace(/[^\d.]/g, "")) : null,
      rateConfidence: price ? "explicit" : "unknown",
      imageUrl,
      firstSeen: capturedAt,
      lastSeen: capturedAt
    }, capturedAt));
  }
  return records;
}

async function enrichDetail(listing, capturedAt) {
  try {
    const html = await fetchText(listing.url);
    const $ = cheerio.load(html);
    const description = clean($("#postingbody").clone().find(".print-information").remove().end().text());
    const address = clean($(".mapaddress").first().text()) || null;
    const attributes = clean($(".attrgroup").text());
    const imageUrl = $(".gallery img").first().attr("src") || $("meta[property='og:image']").attr("content") || listing.imageUrl;
    return normalizeListing({
      ...listing,
      address,
      description: [description, attributes].filter(Boolean).join(" "),
      imageUrl,
      firstSeen: listing.firstSeen,
      lastSeen: capturedAt
    }, capturedAt);
  } catch {
    return listing;
  }
}

export async function fetchCraigslist(capturedAt) {
  try {
    const attempts = await Promise.allSettled(QUERIES.map(async (query) => {
      const params = new URLSearchParams({
        batch: "1-0-0-0-0",
        cc: "US",
        lang: "en",
        searchPath: "see/off",
        query,
        sort: "date"
      });
      return parseCraigslistPayload(await fetchJson(`${API}?${params}`), capturedAt);
    }));
    const batches = attempts.filter((attempt) => attempt.status === "fulfilled").map((attempt) => attempt.value);
    const failedQueries = attempts.length - batches.length;
    if (!batches.length) throw attempts.find((attempt) => attempt.status === "rejected")?.reason || new Error("all_queries_failed");
    const unique = [...new Map(batches.flat().map((record) => [record.canonicalKey, record])).values()];
    const enriched = await mapLimit(unique.slice(0, 70), 6, (record) => enrichDetail(record, capturedAt));
    const retail = enriched.filter((record) =>
      record.propertyType !== "Commercial"
      && !/virtual office|private office|co-?working|office space by the hour/i.test(record.title)
    );
    return sourceResult(SOURCE, "public-api", retail.length ? "healthy" : "empty", retail,
      retail.length
        ? `Public commercial search refreshed; listing pages were used only for visible details.${failedQueries ? ` ${failedQueries} of ${attempts.length} search lanes failed without stopping the source.` : ""}`
        : "The public search returned no retail-oriented spaces.",
      SEARCH_URL, capturedAt);
  } catch (error) {
    return sourceResult(SOURCE, "public-api", error?.blocked ? "blocked" : "error", [],
      error?.blocked ? "Craigslist rejected or rate-limited the request; existing listings were preserved." : `Refresh failed: ${error.message}`,
      SEARCH_URL, capturedAt);
  }
}
