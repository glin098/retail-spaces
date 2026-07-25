import * as cheerio from "cheerio";
import { clean, fetchJson, fetchText, mapLimit, normalizeListing, sourceResult, textFromHtml } from "../lib.mjs";

const SOURCE = "Seattle Restored";
const SEARCH_URL = "https://seattlerestored.org/participate/opportunities/";
const API_URL = "https://seattlerestored.org/wp-json/wp/v2/opportunity?per_page=100&_embed=1";

export function selectSpaceOpportunities(rows) {
  return (rows || []).filter((row) => {
    const terms = (row?._embedded?.["wp:term"] || []).flat().map((term) => term.name).join(" ");
    const title = textFromHtml(row?.title?.rendered);
    return /studio space|retail|storefront|commercial space/i.test(`${terms} ${title}`)
      || /free studio space|storefronts|belltown event space|tenant improvement/i.test(title);
  });
}

async function fetchOpportunity(row, capturedAt) {
  const html = await fetchText(row.link);
  const $ = cheerio.load(html);
  const title = textFromHtml(row.title?.rendered);
  const mainText = clean($("main").text() || $(".site-main").text() || $("article").text());
  if (/applications? (?:are )?closed|deadline has passed|no longer accepting/i.test(mainText)) return null;
  const imageUrl = $("meta[property='og:image']").attr("content") || $("main img").first().attr("src") || null;
  const termNames = (row?._embedded?.["wp:term"] || []).flat().map((term) => clean(term.name)).filter(Boolean);
  return normalizeListing({
    source: SOURCE,
    sourceTier: "public-web",
    externalId: String(row.id),
    canonicalKey: `seattle-restored:${row.id}`,
    url: row.link,
    title,
    address: null,
    propertyType: /storefront|retail/i.test(`${title} ${mainText}`) ? "Pop-up retail" : "Studio / creative retail",
    description: mainText,
    features: [...termNames, "Pop-up friendly"],
    imageUrl,
    company: SOURCE,
    firstSeen: capturedAt,
    lastSeen: capturedAt,
    sourceUpdatedAt: row.modified ? `${row.modified}Z` : null
  }, capturedAt);
}

export async function fetchSeattleRestored(capturedAt) {
  try {
    const candidates = selectSpaceOpportunities(await fetchJson(API_URL));
    const resolved = await mapLimit(candidates, 4, (row) => fetchOpportunity(row, capturedAt).catch(() => null));
    const records = resolved.filter(Boolean);
    return sourceResult(SOURCE, "public-web", records.length ? "healthy" : "empty", records,
      records.length ? "Public space and storefront opportunity pages refreshed." : "No currently open space opportunities were found.",
      SEARCH_URL, capturedAt);
  } catch (error) {
    return sourceResult(SOURCE, "public-web", error?.blocked ? "blocked" : "error", [],
      error?.blocked ? "Seattle Restored rejected the request; existing listings were preserved." : `Refresh failed: ${error.message}`,
      SEARCH_URL, capturedAt);
  }
}
