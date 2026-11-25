import { expect, it, vi } from "vitest";
import { CachedCampaignInsightsRepository } from "./cached-campaign-insights-repository";

const range = { since: "2026-01-01", until: "2026-01-31" };
const empty = { campaigns: [], rows: [], budgetChanges: [] };

it("reads the source once until it expires or fresh data is asked for", async () => {
  let now = 0;
  const source = { fetchDaily: vi.fn().mockResolvedValue(empty) };
  const cached = new CachedCampaignInsightsRepository(source, 100, () => now);
  await cached.fetchDaily("1", range);
  await cached.fetchDaily("1", range);
  expect(source.fetchDaily).toHaveBeenCalledTimes(1);
  await cached.fetchDaily("1", range, { fresh: true });
  expect(source.fetchDaily).toHaveBeenCalledTimes(2);
  now = 500;
  await cached.fetchDaily("1", range);
  expect(source.fetchDaily).toHaveBeenCalledTimes(3);
});

it("does not keep failures", async () => {
  const source = { fetchDaily: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(empty) };
  const cached = new CachedCampaignInsightsRepository(source, 100);
  await expect(cached.fetchDaily("1", range)).rejects.toThrow("boom");
  await expect(cached.fetchDaily("1", range)).resolves.toEqual(empty);
});
