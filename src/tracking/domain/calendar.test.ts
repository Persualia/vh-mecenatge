import { describe, expect, it } from "vitest";
import { clampRange, dataWindow, periodOf, presetRange, RANGE_PRESETS, rangeText, toDayNumber, toIso } from "./calendar";

const preset = (id: string) => RANGE_PRESETS.find((p) => p.id === id)!;

describe("periods", () => {
  it("starts weeks on Monday", () => {
    const week = periodOf(toDayNumber("2026-10-14"), "week");
    expect([toIso(week.start), toIso(week.end)]).toEqual(["2026-10-12", "2026-10-18"]);
  });

  it("covers whole calendar months", () => {
    const month = periodOf(toDayNumber("2026-02-14"), "month");
    expect([toIso(month.start), toIso(month.end)]).toEqual(["2026-02-01", "2026-02-28"]);
  });
});

describe("data window", () => {
  it("leaves today out, since its numbers are still partial", () => {
    expect(dataWindow("2026-11-25").until).toBe("2026-11-24");
  });

  it("covers a whole year of history by default", () => {
    expect(dataWindow("2026-11-25")).toEqual({ since: "2025-11-25", until: "2026-11-24" });
  });
});

describe("date filter", () => {
  const bounds = { since: "2026-07-02", until: "2026-11-11" };

  it("counts a preset back from the last day with data, not from today", () => {
    expect(presetRange(preset("7"), bounds)).toEqual({ since: "2026-11-05", until: "2026-11-11" });
    expect(presetRange(preset("30"), bounds)).toEqual({ since: "2026-10-13", until: "2026-11-11" });
  });

  it("never reaches past the days that hold data", () => {
    expect(presetRange(preset("90"), bounds).since).toBe("2026-08-14");
    expect(presetRange(preset("all"), bounds)).toEqual(bounds);
    expect(clampRange({ since: "2020-01-01", until: "2030-01-01" }, bounds)).toEqual(bounds);
  });

  it("writes the range the way the captions show it", () => {
    expect(rangeText(bounds)).toBe("del 02/07/26 al 11/11/26");
  });
});
