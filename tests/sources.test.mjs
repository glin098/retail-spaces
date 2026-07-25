import assert from "node:assert/strict";
import test from "node:test";
import { parseCannonArchive } from "../scraper/sources/cannon.mjs";
import { parseCraigslistPayload } from "../scraper/sources/craigslist.mjs";
import { parsePikePage, parsePikeSitemap } from "../scraper/sources/pike-place.mjs";

test("decodes Craigslist ids, images, price, and coordinates", () => {
  const rows = parseCraigslistPayload({
    data: {
      categoryAbbr: "off",
      location: { url: "seattle.craigslist.org" },
      params: { subarea: "see" },
      decode: { minPostingId: 7_900_000_000, locationDescriptions: [0, "Capitol Hill"] },
      items: [[
        123, 0, 0, 1450, "1:1~47.61~-122.32",
        [4, "3:abc_0CI0t2"],
        [6, "seattle-retail-space"],
        [10, "$1,450"],
        "Retail storefront on Pike"
      ]]
    }
  }, "2026-07-25T00:00:00.000Z");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonicalKey, "craigslist:7900000123");
  assert.equal(rows[0].estimatedMonthly, 1450);
  assert.equal(rows[0].neighborhood, "Capitol Hill");
  assert.equal(rows[0].latitude, 47.61);
  assert.match(rows[0].imageUrl, /abc_0CI0t2/);
});

test("keeps only active lease cards from Cannon archive", () => {
  const rows = parseCannonArchive(`
    <div class="listing-wrap" id="listing-12">
      <h2 class="entry-title"><a href="https://example.com/a">For Lease | 100 Pine St</a></h2>
      <div class="wpsight-listing-status">For lease</div>
      <div class="wpsight-listing-price">$30/SF/YR + NNN</div>
    </div>
    <div class="listing-wrap" id="listing-13">
      <h2 class="entry-title"><a href="https://example.com/b">Old listing</a></h2>
      <div class="wpsight-listing-status">leased</div>
    </div>
  `);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].externalId, "12");
  assert.match(rows[0].askingRateRaw, /30/);
});

test("discovers and parses current Pike Place leasing pages", () => {
  const urls = parsePikeSitemap(`
    <url><loc>https://example.com/leasing-opportunity-1432-western-ave/</loc></url>
    <url><loc>https://example.com/about/</loc></url>
  `);
  assert.deepEqual(urls, ["https://example.com/leasing-opportunity-1432-western-ave/"]);
  const listing = parsePikePage(`
    <html><head><meta property="og:image" content="https://img.example/a.jpg"></head><body>
      <h1>Leasing Opportunity: 1432 Western Avenue</h1>
      <div class="column__text">Bar/Café Space Available. Square Footage 499 sqft. Monthly Base Rent $1,450.</div>
    </body></html>
  `, urls[0], "2026-07-25T00:00:00.000Z");
  assert.equal(listing.address, "1432 Western Avenue");
  assert.equal(listing.availableSf, 499);
  assert.equal(listing.estimatedMonthly, 1450);
});
