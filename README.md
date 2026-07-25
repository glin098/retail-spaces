# Retail Space Scout

A Seattle retail-space dashboard modeled on DriveScout's durable ingestion pattern and Furniture Finder's source-aware collection rules.

It collects public commercial listings every six hours, normalizes square footage and rent without hiding lease structure, stores history in Supabase, and exposes challenge-gated sources as honest direct-search links.

## Automated sources

- Craigslist's public Seattle commercial search
- Cannon Commercial's public Seattle lease pages
- Pike Place Market PDA leasing opportunity pages
- Seattle Restored space and storefront opportunities

LoopNet, Crexi, CommercialCafe, CBA, Facebook Marketplace, and additional brokerage portfolios appear in the source directory. They are not scraped when a source requires a login, CAPTCHA, or browser challenge.

## Set up

1. Install dependencies with `npm install`.
2. Apply [`supabase/migrations/20260725002000_create_retail_space_scout.sql`](supabase/migrations/20260725002000_create_retail_space_scout.sql) to the linked Supabase project.
3. Add `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` to Vercel. The service-role key is server-only and must never use a `VITE_` prefix.
4. Deploy. Vercel calls `/api/refresh` at minute 17 every six hours.
5. Trigger the first run with:

   ```sh
   curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/refresh
   ```

For local UI work without Supabase, `npm run refresh` creates a live fallback snapshot in `src/data/listings.json`.

## Browser capture

`POST /api/capture` accepts up to 100 visible listing records using the same bearer secret. This is intended for a single signed-in GPT/Codex browser task for Facebook Marketplace or other browser-only sources.

```json
{
  "source": "Facebook Marketplace",
  "searchUrl": "https://www.facebook.com/marketplace/...",
  "records": [
    {
      "externalId": "123",
      "title": "Retail storefront for lease",
      "url": "https://www.facebook.com/marketplace/item/123",
      "address": "Seattle, WA",
      "description": "Only facts visible in the listing"
    }
  ]
}
```

The browser workflow must stop on login challenges, CAPTCHAs, rate limits, or ambiguous consent. It must not message brokers or sellers.

## Data rules

- Base rent remains separate from NNN charges.
- Monthly rent is converted to annual $/SF only when square footage is known.
- Blocked, failed, and empty source runs never age listings.
- A listing becomes stale after four confirmed misses from a healthy source and expires after 28 confirmed misses.
- Source-local IDs are the default identity; same-building suites are not merged without reliable suite and size evidence.
