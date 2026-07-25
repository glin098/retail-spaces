import * as cheerio from "cheerio";
import { clean, fetchText, mapLimit, normalizeListing, sourceResult } from "../lib.mjs";

const SOURCE = "Cannon Commercial";
const SEARCH_URL = "https://www.cannoncommercial.com/location/seattle/";

export function parseCannonArchive(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $(".listing-wrap").each((_, element) => {
    const card = $(element);
    const status = clean(card.find(".wpsight-listing-status").text()).toLowerCase();
    if (!status.includes("for lease")) return;
    const link = card.find(".entry-title a").first();
    const url = link.attr("href");
    const title = clean(link.text());
    if (!url || !title) return;
    rows.push({
      externalId: card.attr("id")?.replace("listing-", "") || url,
      url,
      title,
      askingRateRaw: /price on request/i.test(clean(card.find(".wpsight-listing-price").text()))
        ? null
        : clean(card.find(".wpsight-listing-price").text()) || null,
      imageUrl: card.find(".wpsight-listing-thumbnail img").attr("src") || null
    });
  });
  return rows;
}

async function fetchDetail(raw, capturedAt) {
  try {
    const html = await fetchText(raw.url);
    const $ = cheerio.load(html);
    const description = clean($(".wpsight-listing-description").first().text());
    const pageText = clean($("main, .site-main, .site-content").first().text());
    const combined = `${raw.title} ${description} ${pageText}`;
    return normalizeListing({
      source: SOURCE,
      sourceTier: "public-web",
      ...raw,
      canonicalKey: `cannon:${raw.externalId}`,
      address: raw.title.replace(/^(?:for lease(?: or sale)?|creative office space)\s*\|\s*/i, "").split("|")[0].trim(),
      description,
      company: SOURCE,
      propertyType: /retail|storefront|commercial condo|theatre|studio/i.test(combined) ? undefined : "Commercial",
      firstSeen: capturedAt,
      lastSeen: capturedAt
    }, capturedAt);
  } catch {
    return normalizeListing({
      source: SOURCE,
      sourceTier: "public-web",
      ...raw,
      canonicalKey: `cannon:${raw.externalId}`,
      company: SOURCE,
      firstSeen: capturedAt,
      lastSeen: capturedAt
    }, capturedAt);
  }
}

export async function fetchCannon(capturedAt) {
  try {
    const html = await fetchText(SEARCH_URL);
    const archive = parseCannonArchive(html);
    const records = await mapLimit(archive, 4, (record) => fetchDetail(record, capturedAt));
    const retail = records.filter((record) => /retail|storefront|commercial condo|theatre|studio|ground-floor|flex|showroom/i.test(
      `${record.title} ${record.description || ""}`
    ));
    return sourceResult(SOURCE, "public-web", retail.length ? "healthy" : "empty", retail,
      `${records.length} active Seattle lease pages checked; ${retail.length} retail-compatible spaces kept.`,
      SEARCH_URL, capturedAt);
  } catch (error) {
    return sourceResult(SOURCE, "public-web", error?.blocked ? "blocked" : "error", [],
      error?.blocked ? "The brokerage site rejected the request; existing listings were preserved." : `Refresh failed: ${error.message}`,
      SEARCH_URL, capturedAt);
  }
}
