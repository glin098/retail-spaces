import fallback from "../data/listings.json";
import type { RetailDataset } from "../types";

export async function fetchDashboard(): Promise<RetailDataset> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/dashboard", {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`dashboard_${response.status}`);
    return await response.json() as RetailDataset;
  } catch {
    return fallback as unknown as RetailDataset;
  } finally {
    window.clearTimeout(timeout);
  }
}
