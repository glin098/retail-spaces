export type ListingStatus = "new" | "active" | "stale" | "expired";
export type SourceStatus = "healthy" | "empty" | "blocked" | "error" | "manual";

export interface RetailListing {
  id: string;
  canonicalKey: string;
  source: string;
  sourceTier: "public-api" | "public-web" | "manual-browser";
  externalId: string;
  url: string;
  title: string;
  propertyName: string | null;
  address: string | null;
  city: string;
  state: string;
  zip: string | null;
  neighborhood: string | null;
  suite: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string;
  minSf: number | null;
  maxSf: number | null;
  availableSf: number | null;
  askingRateRaw: string | null;
  baseRatePsfYear: number | null;
  nnnPsfYear: number | null;
  estimatedMonthly: number | null;
  rateConfidence: "explicit" | "derived" | "unknown";
  leaseType: "NNN" | "gross" | "modified gross" | "percentage" | "unknown";
  availableDate: string | null;
  features: string[];
  imageUrl: string | null;
  description: string | null;
  broker: string | null;
  company: string | null;
  qualityScore: number;
  qualityReasons: string[];
  status: ListingStatus;
  firstSeen: string;
  lastSeen: string;
  sourceUpdatedAt: string | null;
  missedRuns: number;
}

export interface SourceHealth {
  source: string;
  tier: RetailListing["sourceTier"];
  status: SourceStatus;
  recordCount: number;
  attemptedAt: string;
  message: string;
  searchUrl: string;
}

export interface SourceDirectoryItem {
  name: string;
  category: "automated" | "manual";
  searchUrl: string;
  note: string;
}

export interface RetailDataset {
  generatedAt: string | null;
  cadenceHours: number;
  market: string;
  listings: RetailListing[];
  sources: SourceHealth[];
  directory: SourceDirectoryItem[];
}
