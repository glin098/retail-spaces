import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight, Building2, CheckCircle2, ChevronDown, CircleAlert, Clock3,
  ExternalLink, Gauge, MapPin, RefreshCw, Ruler, Search, SlidersHorizontal,
  Sparkles, Store, Tags, X
} from "lucide-react";
import { fetchDashboard } from "./lib/api";
import type { RetailDataset, RetailListing, SourceHealth } from "./types";

const money = (value: number | null) => value == null
  ? "Contact"
  : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

const number = (value: number | null) => value == null ? "—" : new Intl.NumberFormat("en-US").format(value);

const rate = (value: number | null) => value == null
  ? "Contact"
  : `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}/SF/YR`;

const timeAgo = (value: string | null) => {
  if (!value) return "not yet";
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 3_600_000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const isNew = (listing: RetailListing) => Date.now() - Date.parse(listing.firstSeen) < 36 * 3_600_000;

function SourceBadge({ source }: { source: SourceHealth }) {
  const icon = source.status === "healthy"
    ? <CheckCircle2 size={14} />
    : source.status === "manual"
      ? <ExternalLink size={14} />
      : <CircleAlert size={14} />;
  return (
    <a className={`sourceBadge ${source.status}`} href={source.searchUrl} target="_blank" rel="noreferrer" title={source.message}>
      {icon}
      <span>{source.source}</span>
      {source.status === "healthy" && <b>{source.recordCount}</b>}
    </a>
  );
}

function ListingCard({ listing }: { listing: RetailListing }) {
  const location = listing.address || listing.neighborhood || `${listing.city}, ${listing.state}`;
  return (
    <article className="listingCard">
      <a className="cardImage" href={listing.url} target="_blank" rel="noreferrer" aria-label={`Open ${listing.title}`}>
        {listing.imageUrl
          ? <img src={listing.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          : <div className="imageFallback"><Store size={34} /><span>{listing.propertyType}</span></div>}
        <div className="imageShade" />
        <div className="cardBadges">
          {isNew(listing) && <span className="badge new"><Sparkles size={12} /> New</span>}
          {listing.status === "stale" && <span className="badge stale"><Clock3 size={12} /> Verify</span>}
          <span className="badge source">{listing.source}</span>
        </div>
        <span className="quality" title={listing.qualityReasons.join(" · ")}>{listing.qualityScore}</span>
      </a>

      <div className="cardBody">
        <div className="eyebrow">{listing.propertyType}</div>
        <h2>{listing.title}</h2>
        <p className="location"><MapPin size={15} /> {location}</p>

        <div className="facts">
          <div>
            <span><Ruler size={14} /> Space</span>
            <strong>{listing.minSf && listing.maxSf && listing.minSf !== listing.maxSf
              ? `${number(listing.minSf)}–${number(listing.maxSf)} SF`
              : listing.availableSf ? `${number(listing.availableSf)} SF` : "Ask broker"}</strong>
          </div>
          <div>
            <span><Tags size={14} /> Base rate</span>
            <strong>{rate(listing.baseRatePsfYear)}</strong>
          </div>
          <div>
            <span><Gauge size={14} /> Est. monthly</span>
            <strong>{money(listing.estimatedMonthly)}</strong>
          </div>
        </div>

        {listing.features.length > 0 && (
          <div className="featureRow">
            {listing.features.slice(0, 4).map((feature) => <span key={feature}>{feature}</span>)}
          </div>
        )}
        {listing.description && <p className="description">{listing.description}</p>}

        <div className="cardFooter">
          <span>Seen {timeAgo(listing.lastSeen)}</span>
          <a href={listing.url} target="_blank" rel="noreferrer">View listing <ArrowUpRight size={15} /></a>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState<RetailDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [type, setType] = useState("all");
  const [maxSf, setMaxSf] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [sort, setSort] = useState("quality");
  const [coverageOpen, setCoverageOpen] = useState(false);

  useEffect(() => {
    fetchDashboard().then(setData).finally(() => setLoading(false));
  }, []);

  const listings = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.listings
      .filter((listing) => listing.status !== "expired")
      .filter((listing) => source === "all" || listing.source === source)
      .filter((listing) => type === "all" || listing.propertyType === type)
      .filter((listing) => !maxSf || !listing.availableSf || listing.availableSf <= Number(maxSf))
      .filter((listing) => !maxRate || !listing.baseRatePsfYear || listing.baseRatePsfYear <= Number(maxRate))
      .filter((listing) => !needle || [
        listing.title, listing.address, listing.neighborhood, listing.propertyType,
        listing.description, listing.features.join(" ")
      ].some((value) => value?.toLowerCase().includes(needle)))
      .sort((a, b) => {
        if (sort === "newest") return Date.parse(b.lastSeen) - Date.parse(a.lastSeen);
        if (sort === "rate") return (a.baseRatePsfYear ?? Infinity) - (b.baseRatePsfYear ?? Infinity);
        if (sort === "size") return (a.availableSf ?? Infinity) - (b.availableSf ?? Infinity);
        return b.qualityScore - a.qualityScore || Date.parse(b.lastSeen) - Date.parse(a.lastSeen);
      });
  }, [data, maxRate, maxSf, query, sort, source, type]);

  const sources = [...new Set((data?.listings || []).map((listing) => listing.source))].sort();
  const types = [...new Set((data?.listings || []).map((listing) => listing.propertyType))].sort();
  const priced = (data?.listings || []).filter((listing) => listing.baseRatePsfYear != null);
  const medianRate = priced.length
    ? [...priced].sort((a, b) => (a.baseRatePsfYear || 0) - (b.baseRatePsfYear || 0))[Math.floor(priced.length / 2)].baseRatePsfYear
    : null;
  const healthySources = (data?.sources || []).filter((item) => item.status === "healthy").length;
  const hasFilters = query || source !== "all" || type !== "all" || maxSf || maxRate;

  const clearFilters = () => {
    setQuery("");
    setSource("all");
    setType("all");
    setMaxSf("");
    setMaxRate("");
  };

  return (
    <div className="app">
      <header className="hero">
        <nav>
          <a className="brand" href="#"><span><Building2 size={19} /></span> Retail Space Scout</a>
          <div className="navMeta"><span className="pulse" /> Seattle market · 6-hour refresh</div>
        </nav>
        <div className="heroGrid">
          <div>
            <p className="kicker">Seattle storefront intelligence</p>
            <h1>Find the space<br />before the sign goes up.</h1>
            <p className="heroCopy">A single, regularly refreshed view of neighborhood retail, restaurant, pop-up, and creative commercial spaces.</p>
          </div>
          <div className="refreshCard">
            <div><RefreshCw size={20} /><span>Last market sweep</span></div>
            <strong>{loading ? "Loading…" : timeAgo(data?.generatedAt || null)}</strong>
            <small>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : "Waiting for first Supabase refresh"}</small>
          </div>
        </div>
      </header>

      <main>
        <section className="statGrid" aria-label="Market summary">
          <div><span>Live opportunities</span><strong>{data?.listings.filter((item) => item.status !== "expired").length || 0}</strong><small>Across automated feeds</small></div>
          <div><span>Published pricing</span><strong>{priced.length}</strong><small>{data?.listings.length ? `${Math.round(priced.length / data.listings.length * 100)}% of listings` : "Awaiting refresh"}</small></div>
          <div><span>Median base rate</span><strong>{medianRate ? `$${medianRate}` : "—"}</strong><small>{medianRate ? "per SF / year" : "Not enough priced data"}</small></div>
          <div><span>Healthy feeds</span><strong>{healthySources}</strong><small>{data?.sources.length || 0} sources monitored</small></div>
        </section>

        <section className="coverage">
          <button onClick={() => setCoverageOpen((open) => !open)} aria-expanded={coverageOpen}>
            <span><span className="statusDot" /> Source coverage</span>
            <span>{healthySources} automated · {(data?.sources || []).filter((item) => item.status === "manual").length} direct-search <ChevronDown className={coverageOpen ? "rotate" : ""} size={18} /></span>
          </button>
          {coverageOpen && (
            <div className="coverageBody">
              <div className="sourceBadges">
                {(data?.sources || []).map((item) => <SourceBadge key={`${item.source}-${item.tier}`} source={item} />)}
              </div>
              <p>Challenge-gated and sign-in sources stay as direct links. The automated collector never bypasses CAPTCHAs or rate limits.</p>
            </div>
          )}
        </section>

        <section className="finder">
          <div className="finderHeading">
            <div>
              <p className="kicker">Opportunity board</p>
              <h2>{loading ? "Loading spaces…" : `${listings.length} spaces in view`}</h2>
            </div>
            {hasFilters && <button className="clear" onClick={clearFilters}><X size={15} /> Clear filters</button>}
          </div>
          <div className="filters">
            <label className="searchField">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search neighborhood, address, hood, patio…" />
            </label>
            <label><span>Source</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Space type</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All types</option>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Max size</span><select value={maxSf} onChange={(event) => setMaxSf(event.target.value)}><option value="">Any size</option><option value="1000">1,000 SF</option><option value="2500">2,500 SF</option><option value="5000">5,000 SF</option><option value="10000">10,000 SF</option></select></label>
            <label><span>Max base rate</span><select value={maxRate} onChange={(event) => setMaxRate(event.target.value)}><option value="">Any rate</option><option value="20">$20/SF/YR</option><option value="30">$30/SF/YR</option><option value="40">$40/SF/YR</option><option value="50">$50/SF/YR</option></select></label>
            <label><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="quality">Best documented</option><option value="newest">Recently seen</option><option value="rate">Lowest rate</option><option value="size">Smallest space</option></select></label>
          </div>
        </section>

        {loading ? (
          <div className="loadingGrid">{[1, 2, 3, 4, 5, 6].map((item) => <div className="skeleton" key={item} />)}</div>
        ) : listings.length ? (
          <section className="listingGrid">{listings.map((listing) => <ListingCard key={listing.canonicalKey} listing={listing} />)}</section>
        ) : (
          <section className="emptyState"><SlidersHorizontal size={34} /><h2>No spaces match those filters.</h2><p>Try widening the rate, size, or source selection.</p><button onClick={clearFilters}>Reset filters</button></section>
        )}

        <section className="sourceDirectory">
          <div>
            <p className="kicker">Keep looking</p>
            <h2>Direct market searches</h2>
            <p>Open regional, brokerage, public-sector, and signed-in sources that cannot be collected reliably in the cloud.</p>
          </div>
          <div className="directoryLinks">
            {(data?.directory || []).filter((item) => item.category === "manual").map((item) => (
              <a key={item.name} href={item.searchUrl} target="_blank" rel="noreferrer">
                <span>{item.name}<small>{item.note}</small></span><ArrowUpRight size={18} />
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <div><Building2 size={18} /> Retail Space Scout</div>
        <p>Rates are normalized only when the listing states enough information. Always verify availability, lease structure, NNN charges, permitted use, and broker terms at the source.</p>
      </footer>
    </div>
  );
}
