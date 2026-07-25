import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MANUAL_SOURCE_HEALTH, SOURCE_DIRECTORY } from "../scraper/directory.mjs";
import { normalizeListing, sourceResult } from "../scraper/lib.mjs";
import { databaseConfigured, getDashboard, recordSourceRun, upsertListings } from "./_lib/db.mjs";
import { refreshInventory } from "./_lib/refresh.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
};

const routePath = (request) => new URL(request.url, "http://localhost").pathname.replace(/^\/api\/?/, "");

const authorized = (request) => {
  const secret = process.env.CRON_SECRET || process.env.CAPTURE_SECRET;
  if (!secret) return false;
  return request.headers.authorization === `Bearer ${secret}`
    || request.headers["x-cron-secret"] === secret;
};

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 1_000_000) throw new Error("payload_too_large");
  return raw ? JSON.parse(raw) : {};
}

async function fallbackDashboard() {
  try {
    const file = path.resolve(dirname, "../src/data/listings.json");
    const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
    const sourceMap = new Map([
      ...(snapshot.sources || []),
      ...MANUAL_SOURCE_HEALTH
    ].map((source) => [`${source.source}:${source.tier}`, source]));
    return {
      ...snapshot,
      sources: [...sourceMap.values()],
      directory: SOURCE_DIRECTORY
    };
  } catch {
    return {
      generatedAt: null,
      cadenceHours: 12,
      market: "Seattle, WA",
      listings: [],
      sources: MANUAL_SOURCE_HEALTH,
      directory: SOURCE_DIRECTORY
    };
  }
}

export default async function handler(request, response) {
  const route = routePath(request);
  try {
    if (request.method === "GET" && (route === "dashboard" || route === "")) {
      return json(response, 200, databaseConfigured() ? await getDashboard() : await fallbackDashboard());
    }
    if (request.method === "GET" && route === "health") {
      return json(response, 200, {
        ok: true,
        databaseConfigured: databaseConfigured(),
        cadenceHours: 12
      });
    }
    if ((request.method === "GET" || request.method === "POST") && route === "refresh") {
      if (!authorized(request)) return json(response, 401, { error: "unauthorized" });
      if (!databaseConfigured()) return json(response, 503, { error: "database_not_configured" });
      return json(response, 200, await refreshInventory());
    }
    if (request.method === "POST" && route === "capture") {
      if (!authorized(request)) return json(response, 401, { error: "unauthorized" });
      if (!databaseConfigured()) return json(response, 503, { error: "database_not_configured" });
      const payload = await body(request);
      const rows = Array.isArray(payload.records) ? payload.records.slice(0, 100) : [];
      const capturedAt = new Date().toISOString();
      const source = String(payload.source || "Facebook Marketplace").slice(0, 80);
      const listings = rows
        .filter((row) => row && row.url && row.title)
        .map((row) => normalizeListing({
          ...row,
          source,
          sourceTier: "manual-browser",
          firstSeen: row.firstSeen || capturedAt,
          lastSeen: capturedAt
        }, capturedAt));
      await upsertListings(listings);
      await recordSourceRun(sourceResult(
        source,
        "manual-browser",
        listings.length ? "healthy" : "empty",
        listings,
        "Signed-in browser capture ingested visible listing facts.",
        payload.searchUrl || "",
        capturedAt
      ));
      return json(response, 200, { ok: true, ingested: listings.length });
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    return json(response, 500, { error: "internal_error", message: String(error?.message || error).slice(0, 500) });
  }
}
