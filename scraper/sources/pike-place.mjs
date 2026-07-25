import * as cheerio from "cheerio";
import { clean, fetchText, mapLimit, normalizeListing, sourceResult } from "../lib.mjs";

const SOURCE = "Pike Place Market PDA";
const SEARCH_URL = "https://www.pikeplacemarket.org/join-our-community/lease-a-commercial-space-at-pike-place-market/";
const SITEMAP_URL = "https://www.pikeplacemarket.org/page-sitemap.xml";

export function parsePikeSitemap(xml) {
  return [...xml.matchAll(/<loc>([^<]*leasing-opportunity-[^<]+)<\/loc>/gi)].map((match) => match[1]);
}

export function parsePikePage(html, url, capturedAt = new Date().toISOString()) {
  const $ = cheerio.load(html);
  const title = clean($("h1").first().text()) || clean($("title").text()).replace(/ - Pike Place Market$/, "");
  const content = clean($(".column__text").text() || $("main").text());
  const address = title.replace(/^Leasing Opportunity:\s*/i, "") || null;
  const imageUrl = $("meta[property='og:image']").attr("content") || $(".column__text img").first().attr("src") || null;
  const externalId = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  return normalizeListing({
    source: SOURCE,
    sourceTier: "public-web",
    externalId,
    canonicalKey: `pike-place:${externalId}`,
    url,
    title,
    address,
    neighborhood: "Pike Place Market",
    propertyType: undefined,
    description: content,
    imageUrl,
    company: SOURCE,
    firstSeen: capturedAt,
    lastSeen: capturedAt
  }, capturedAt);
}

export async function fetchPikePlace(capturedAt) {
  try {
    const urls = parsePikeSitemap(await fetchText(SITEMAP_URL));
    const records = await mapLimit(urls, 3, async (url) => parsePikePage(await fetchText(url), url, capturedAt));
    return sourceResult(SOURCE, "public-web", records.length ? "healthy" : "empty", records,
      records.length ? "Current leasing opportunity pages refreshed from the Market's public sitemap." : "No current individual leasing opportunity pages were published.",
      SEARCH_URL, capturedAt);
  } catch (error) {
    return sourceResult(SOURCE, "public-web", error?.blocked ? "blocked" : "error", [],
      error?.blocked ? "The Market site rejected the request; existing listings were preserved." : `Refresh failed: ${error.message}`,
      SEARCH_URL, capturedAt);
  }
}
