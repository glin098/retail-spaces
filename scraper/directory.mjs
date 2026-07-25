export const SOURCE_DIRECTORY = [
  {
    name: "Craigslist",
    category: "automated",
    searchUrl: "https://seattle.craigslist.org/search/see/off?query=retail&sort=date",
    note: "Public commercial search; refreshed every six hours."
  },
  {
    name: "Cannon Commercial",
    category: "automated",
    searchUrl: "https://www.cannoncommercial.com/location/seattle/",
    note: "Public Seattle brokerage listings."
  },
  {
    name: "Pike Place Market PDA",
    category: "automated",
    searchUrl: "https://www.pikeplacemarket.org/join-our-community/lease-a-commercial-space-at-pike-place-market/",
    note: "Current Market leasing opportunity pages."
  },
  {
    name: "Seattle Restored",
    category: "automated",
    searchUrl: "https://seattlerestored.org/participate/opportunities/",
    note: "Pop-up, storefront, studio, and incubator opportunities."
  },
  {
    name: "Commercial Brokers Association",
    category: "manual",
    searchUrl: "https://www.commercialmls.com/",
    note: "Authoritative regional inventory; interactive member search is not automated."
  },
  {
    name: "LoopNet",
    category: "manual",
    searchUrl: "https://www.loopnet.com/search/retail-space/seattle-wa/for-lease/",
    note: "Challenge-gated national search; open directly to review."
  },
  {
    name: "Crexi",
    category: "manual",
    searchUrl: "https://www.crexi.com/lease/properties/WA/Seattle/Retail",
    note: "Challenge-gated national search; open directly to review."
  },
  {
    name: "CommercialCafe",
    category: "manual",
    searchUrl: "https://www.commercialcafe.com/retail/us/wa/seattle/",
    note: "Challenge-gated syndicated inventory."
  },
  {
    name: "Facebook Marketplace",
    category: "manual",
    searchUrl: "https://www.facebook.com/marketplace/seattle/search?query=retail%20space%20for%20lease&sortBy=creation_time_descend",
    note: "Signed-in browser source; visible results can be sent to the capture endpoint."
  },
  {
    name: "West Coast Commercial Realty",
    category: "manual",
    searchUrl: "https://www.wccommercialrealty.com/",
    note: "Seattle retail brokerage portfolio."
  },
  {
    name: "Ewing & Clark",
    category: "manual",
    searchUrl: "https://www.ewingandclark.com/commercial-real-estate-leasing/",
    note: "Neighborhood commercial and retail leasing."
  },
  {
    name: "Kidder Mathews Seattle",
    category: "manual",
    searchUrl: "https://kidder.com/office-locations/seattle/",
    note: "Regional brokerage portfolio."
  },
  {
    name: "Port of Seattle",
    category: "manual",
    searchUrl: "https://www.portseattle.org/page/properties-lease-and-development",
    note: "Port-owned commercial and airport retail opportunities."
  }
];

export const MANUAL_SOURCE_HEALTH = SOURCE_DIRECTORY
  .filter((source) => source.category === "manual")
  .map((source) => ({
    source: source.name,
    tier: "manual-browser",
    status: "manual",
    recordCount: 0,
    attemptedAt: new Date(0).toISOString(),
    message: source.note,
    searchUrl: source.searchUrl
  }));
