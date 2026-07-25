import crypto from "node:crypto";
import * as cheerio from "cheerio";

const USER_AGENT = "RetailSpaceScout/1.0 (+https://github.com/glin098/retail-spaces)";

export const nowIso = () => new Date().toISOString();

export const clean = (value) => String(value ?? "")
  .replace(/\u00a0/g, " ")
  .replace(/[ \t\r\n]+/g, " ")
  .trim();

export const textFromHtml = (html) => {
  const $ = cheerio.load(`<div>${html || ""}</div>`);
  return clean($("div").text());
};

export const slug = (value) => clean(value).toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100);

export const stableId = (...parts) => crypto
  .createHash("sha256")
  .update(parts.map(clean).join("|"))
  .digest("hex")
  .slice(0, 20);

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 25_000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: options.accept || "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(options.headers || {})
      }
    });
    if ([401, 403, 429].includes(response.status)) {
      const error = new Error(`blocked_${response.status}`);
      error.blocked = true;
      throw error;
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url, { ...options, accept: "application/json" }));
}

export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

const numeric = (value) => {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function parseSquareFeet(text) {
  const value = clean(text);
  const range = value.match(/\b([\d,]{3,})\s*(?:-|–|—|to)\s*([\d,]{3,})\s*(?:square\s*feet|sq\.?\s*ft\.?|sf)\b/i);
  if (range) {
    const min = numeric(range[1]);
    const max = numeric(range[2]);
    return { minSf: min, maxSf: max, availableSf: min === max ? min : null };
  }
  const statedTotal = value.match(/\b(?:space\s+details[^.]{0,80})?sf:\s*(?:approx(?:imately)?\.?\s*)?([\d,]{3,})\s*(?:sf\b)?/i);
  if (statedTotal) {
    const availableSf = numeric(statedTotal[1]);
    return { minSf: availableSf, maxSf: availableSf, availableSf };
  }
  const matches = [...value.matchAll(/\b([\d,]{3,})\s*(?:square\s*feet|sq\.?\s*ft\.?|sf)\b/gi)]
    .map((match) => numeric(match[1]))
    .filter((item) => item && item >= 100 && item <= 1_000_000);
  const availableSf = matches[0] || null;
  return { minSf: availableSf, maxSf: availableSf, availableSf };
}

export function parseRate(text, availableSf = null) {
  const value = clean(text);
  const explicitYear = value.match(/\$?\s*([\d,.]+)(?:\s*(?:-|–|—|to)\s*\$?\s*([\d,.]+))?\s*\/?\s*(?:sf|sq\.?\s*ft\.?)\s*\/?\s*(?:yr|year|annual)\b/i)
    || value.match(/(?:rent|rate)\s*\/\s*(?:sf|sq\.?\s*ft\.?)\s*:?\s*\$?\s*([\d,.]+)\s*\/?\s*(?:yr|year|annual)\b/i);
  const explicitMonthPsf = value.match(/\$?\s*([\d,.]+)(?:\s*(?:-|–|—|to)\s*\$?\s*([\d,.]+))?\s*\/?\s*(?:sf|sq\.?\s*ft\.?)\s*\/?\s*(?:mo|month)\b/i);
  const monthly = value.match(/(?:monthly(?:\s+base)?\s+rent|rent(?:\s+per\s+month)?|\/\s*month|\/\s*mo)[^$]{0,24}\$\s*([\d,]+)|\$\s*([\d,]+)\s*(?:\/\s*(?:month|mo)|per\s+month)/i);
  let baseRatePsfYear = null;
  let estimatedMonthly = null;
  let rateConfidence = "unknown";
  if (explicitYear) {
    baseRatePsfYear = numeric(explicitYear[1]);
    rateConfidence = "explicit";
    if (baseRatePsfYear && availableSf) estimatedMonthly = Math.round(baseRatePsfYear * availableSf / 12);
  } else if (explicitMonthPsf) {
    const perMonth = numeric(explicitMonthPsf[1]);
    baseRatePsfYear = perMonth == null ? null : Math.round(perMonth * 1200) / 100;
    rateConfidence = "explicit";
    if (perMonth && availableSf) estimatedMonthly = Math.round(perMonth * availableSf);
  } else if (monthly) {
    estimatedMonthly = numeric(monthly[1] || monthly[2]);
    rateConfidence = "explicit";
    if (estimatedMonthly && availableSf) {
      baseRatePsfYear = Math.round((estimatedMonthly * 12 / availableSf) * 100) / 100;
      rateConfidence = "derived";
    }
  }
  const nnn = value.match(/(?:nnn|triple\s+net)[^$\d]{0,20}\$?\s*([\d,.]+)\s*\/?\s*(?:sf|sq\.?\s*ft\.?)(?:\s*\/?\s*(?:yr|year))?/i)
    || value.match(/\$?\s*([\d,.]+)\s*\/?\s*(?:sf|sq\.?\s*ft\.?)\s*(?:nnn|triple\s+net)\b/i);
  const leaseType = /\bnnn\b|triple\s+net/i.test(value)
    ? "NNN"
    : /modified\s+gross/i.test(value)
      ? "modified gross"
      : /\bgross\b/i.test(value)
        ? "gross"
        : /percent(?:age)?\s+rent/i.test(value)
          ? "percentage"
          : "unknown";
  return {
    askingRateRaw: explicitYear?.[0] || explicitMonthPsf?.[0] || monthly?.[0] || null,
    baseRatePsfYear,
    nnnPsfYear: nnn ? numeric(nnn[1]) : null,
    estimatedMonthly,
    rateConfidence,
    leaseType
  };
}

export function extractAddress(text) {
  const value = clean(text);
  const match = value.match(/\b(\d{2,6}\s+(?:[NESW]\.?\s+)?(?:[A-Za-z0-9.'’-]+\s+){0,6}(?:Avenue|Ave\.?|Street|St\.?|Way|Boulevard|Blvd\.?|Road|Rd\.?|Place|Pl\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Highway|Hwy\.?)\b(?:\s+(?:N|S|E|W|NE|NW|SE|SW))?(?:\s*(?:#|Suite|Ste\.?)\s*[A-Za-z0-9-]+)?)/i);
  return match ? clean(match[1]) : null;
}

export function extractSuite(text) {
  const match = clean(text).match(/\b(?:suite|ste\.?|#)\s*([A-Za-z0-9-]{1,12})\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function extractZip(text) {
  return clean(text).match(/\b(98\d{3})\b/)?.[1] || null;
}

export function classifyProperty(text) {
  const value = clean(text).toLowerCase();
  if (/restaurant|café|cafe|bar\b|food service|commercial kitchen/.test(value)) return "Restaurant / café";
  if (/storefront|retail|shop space|shopping center|commercial condo/.test(value)) return "Retail";
  if (/studio|gallery|theatre|theater/.test(value)) return "Studio / creative retail";
  if (/flex|showroom/.test(value)) return "Retail / flex";
  return "Commercial";
}

export function detectFeatures(text) {
  const value = clean(text).toLowerCase();
  const rules = [
    ["Street level", /street[- ]level|ground[- ]floor|ground level/],
    ["Hood", /\bhood\b|venting/],
    ["No Class 1 hood needed", /does not require a class 1 hood/],
    ["Plumbing", /plumbing|\bsink\b|restroom/],
    ["Kitchen", /kitchen|food service/],
    ["Parking", /parking/],
    ["Patio", /patio|outdoor seating/],
    ["Corner", /corner location|corner unit/],
    ["Storefront", /storefront/],
    ["High visibility", /high visibility|street frontage|frontage/],
    ["Transit nearby", /light rail|bus line|transit/],
    ["Pop-up friendly", /pop[- ]?up|short[- ]term/]
  ];
  return rules.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
}

export function normalizeListing(raw, capturedAt = nowIso()) {
  const source = clean(raw.source || "Unknown");
  const externalId = clean(raw.externalId || raw.url || raw.title);
  const text = clean([raw.title, raw.description, raw.askingRateRaw].filter(Boolean).join(" "));
  const sf = {
    ...parseSquareFeet(text),
    ...(raw.minSf == null ? {} : { minSf: numeric(raw.minSf) }),
    ...(raw.maxSf == null ? {} : { maxSf: numeric(raw.maxSf) }),
    ...(raw.availableSf == null ? {} : { availableSf: numeric(raw.availableSf) })
  };
  const rate = {
    ...parseRate(text, sf.availableSf),
    ...(raw.askingRateRaw == null ? {} : { askingRateRaw: clean(raw.askingRateRaw) }),
    ...(raw.baseRatePsfYear == null ? {} : { baseRatePsfYear: numeric(raw.baseRatePsfYear) }),
    ...(raw.nnnPsfYear == null ? {} : { nnnPsfYear: numeric(raw.nnnPsfYear) }),
    ...(raw.estimatedMonthly == null ? {} : { estimatedMonthly: numeric(raw.estimatedMonthly) }),
    ...(raw.rateConfidence == null ? {} : { rateConfidence: raw.rateConfidence }),
    ...(raw.leaseType == null ? {} : { leaseType: raw.leaseType })
  };
  const address = clean(raw.address) || extractAddress(text);
  const suite = clean(raw.suite) || extractSuite(address || text);
  const url = clean(raw.url);
  const canonicalKey = clean(raw.canonicalKey) || `${slug(source)}:${externalId || stableId(url, text)}`;
  const listing = {
    id: stableId(canonicalKey),
    canonicalKey,
    source,
    sourceTier: raw.sourceTier || "public-web",
    externalId,
    url,
    title: clean(raw.title) || "Retail space opportunity",
    propertyName: clean(raw.propertyName) || null,
    address: address || null,
    city: clean(raw.city) || "Seattle",
    state: clean(raw.state) || "WA",
    zip: clean(raw.zip) || extractZip(text),
    neighborhood: clean(raw.neighborhood) || null,
    suite: suite || null,
    latitude: numeric(raw.latitude),
    longitude: numeric(raw.longitude),
    propertyType: clean(raw.propertyType) || classifyProperty(text),
    minSf: sf.minSf,
    maxSf: sf.maxSf,
    availableSf: sf.availableSf,
    ...rate,
    availableDate: clean(raw.availableDate) || null,
    features: [...new Set([...(raw.features || []), ...detectFeatures(text)])],
    imageUrl: clean(raw.imageUrl) || null,
    description: clean(raw.description).slice(0, 1200) || null,
    broker: clean(raw.broker) || null,
    company: clean(raw.company) || null,
    status: raw.status || "active",
    firstSeen: clean(raw.firstSeen) || capturedAt,
    lastSeen: clean(raw.lastSeen) || capturedAt,
    sourceUpdatedAt: clean(raw.sourceUpdatedAt) || null,
    missedRuns: Number(raw.missedRuns || 0)
  };
  const scored = scoreQuality(listing, capturedAt);
  return { ...listing, ...scored };
}

export function scoreQuality(listing, capturedAt = nowIso()) {
  let score = 25;
  const reasons = [];
  if (listing.address) { score += 14; reasons.push("Address published"); }
  if (listing.availableSf) { score += 14; reasons.push("Square footage published"); }
  if (listing.baseRatePsfYear || listing.estimatedMonthly) { score += 16; reasons.push("Pricing published"); }
  if (listing.imageUrl) score += 8;
  if (listing.description && listing.description.length > 120) score += 6;
  if (listing.features.length >= 2) { score += 6; reasons.push("Useful space details"); }
  if (/retail|storefront|restaurant|café|cafe/i.test(`${listing.propertyType} ${listing.title}`)) {
    score += 7;
    reasons.push("Retail use indicated");
  }
  if (listing.availableSf && listing.availableSf <= 5_000) {
    score += 4;
    reasons.push("Small-business scale");
  }
  const ageDays = Math.max(0, (Date.parse(capturedAt) - Date.parse(listing.lastSeen)) / 86_400_000);
  if (ageDays < 2) score += 4;
  return { qualityScore: Math.min(100, Math.round(score)), qualityReasons: reasons.slice(0, 4) };
}

export function sourceResult(source, tier, status, records, message, searchUrl, attemptedAt = nowIso()) {
  return {
    source,
    tier,
    status,
    records,
    recordCount: records.length,
    attemptedAt,
    message,
    searchUrl
  };
}
