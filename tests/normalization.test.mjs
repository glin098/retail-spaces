import assert from "node:assert/strict";
import test from "node:test";
import {
  extractAddress,
  normalizeListing,
  parseRate,
  parseSquareFeet
} from "../scraper/lib.mjs";

test("normalizes explicit annual base rent without folding NNN into it", () => {
  const result = parseRate("ASKING RENT: $36/SF/YR + NNN EXPENSES: NNN $4.85/SF/YR", 5682);
  assert.equal(result.baseRatePsfYear, 36);
  assert.equal(result.nnnPsfYear, 4.85);
  assert.equal(result.leaseType, "NNN");
  assert.equal(result.estimatedMonthly, 17046);
});

test("recognizes broker-style Rent / SF notation ahead of a conflicting monthly headline", () => {
  const result = parseRate(
    "$12,730/month. $47.00 PSF + $12.76/SF NNN. Rent / SF: $47.00 /yr. Rental Terms Rent: $24,863.00",
    3250
  );
  assert.equal(result.baseRatePsfYear, 47);
  assert.equal(result.nnnPsfYear, 12.76);
  assert.equal(result.estimatedMonthly, 12729);
  assert.equal(result.leaseType, "NNN");
});

test("derives annual rate from stated monthly rent and square footage", () => {
  const result = parseRate("Monthly Base Rent $1,450", 499);
  assert.equal(result.estimatedMonthly, 1450);
  assert.equal(result.baseRatePsfYear, 34.87);
  assert.equal(result.rateConfidence, "derived");
});

test("prefers a stated total SF over component spaces", () => {
  const result = parseSquareFeet("Features 3,867 SF theatre and 1,351 SF studio. Space Details: SF: Approx. 5,682 SF");
  assert.deepEqual(result, { minSf: 5682, maxSf: 5682, availableSf: 5682 });
});

test("does not mistake a year and the word storefronts for an address", () => {
  assert.equal(extractAddress("2026 Storefronts South Lake Union"), null);
  assert.equal(extractAddress("Located at 1432 Western Avenue in Seattle"), "1432 Western Avenue");
});

test("keeps raw rate terms while deriving comparable values", () => {
  const listing = normalizeListing({
    source: "Test",
    externalId: "1",
    url: "https://example.com/1",
    title: "Retail at 100 Pike Street",
    description: "499 square feet. Monthly Base Rent $1,450. Percentage rent and utilities additional."
  }, "2026-07-25T00:00:00.000Z");
  assert.equal(listing.availableSf, 499);
  assert.equal(listing.estimatedMonthly, 1450);
  assert.equal(listing.baseRatePsfYear, 34.87);
  assert.equal(listing.leaseType, "percentage");
  assert.match(listing.askingRateRaw, /Monthly Base Rent/);
});
