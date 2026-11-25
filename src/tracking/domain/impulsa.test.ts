import { describe, expect, it } from "vitest";
import aggregate from "../data/impulsa-aggregate.json";
import recordsFile from "../data/impulsa-records.json";
import { donorTotals, resolveRows, yearColumns, type DonorRecordsFile } from "./donors";
import { criterionText, impulsaCards, impulsaWeeks, impulsaWeeksTotals, type ImpulsaAggregate } from "./impulsa";

const data = aggregate as ImpulsaAggregate;
const file = recordsFile as DonorRecordsFile;
const TODAY = "2026-11-25";

const totalsWith = (overrides = {}) => {
  const years = yearColumns(file.records, overrides, TODAY);
  return donorTotals(resolveRows(file.records, overrides, years, TODAY), years, TODAY);
};

describe("the generated aggregate", () => {
  it("reproduces every figure of the file's own summary", () => {
    expect(data.checks.filter((c) => !c.ok)).toEqual([]);
  });

  it("carries the advertising spend the cards show", () => {
    expect(data.cards.spendEur).toBe(6601);
    expect(data.cutOff).toBe("2026-11-12");
  });

  it("holds no names, e-mail addresses or record identifiers", () => {
    expect(JSON.stringify(data)).not.toMatch(/@/);
    expect(JSON.stringify(file)).not.toMatch(/@/);
    expect(Object.keys(file.records[0]).sort()).toEqual(
      ["base", "billedEur", "channel", "date", "firstYearEur", "frequency", "included", "instalments", "recurring", "ref", "state", "system"].sort(),
    );
  });

  it("reads a row with no channel written as Meta", () => {
    expect(file.defaultChannel).toBe("meta");
    expect(data.attribution.map((a) => a.key).sort()).toEqual(["google", "meta", "newsletter"]);
    expect(data.attribution.find((a) => a.key === "meta")).toMatchObject({ count: 103, billedEur: 7509, yearEur: 16495 });
  });

  it("reproduces the file's own per-channel ROAS under that rule", () => {
    expect(data.metaChannelRoasBasis.reproducesYear).toBe(true);
    expect(data.metaChannelRoasBasis.reproducesBilled).toBe(true);
  });

  it("writes the criterion the file states", () => {
    expect(criterionText(data)).toBe("mensual ×12 · trimestral ×4 · anual ×1 · puntual ×1");
  });
});

describe("the cards, recomputed from the records", () => {
  it("lands on the file's own totals when nothing has been corrected", () => {
    const cards = impulsaCards(data, totalsWith());
    expect(cards.billedEur).toBe(7868);
    expect(cards.generatedEur).toBe(18213);
    expect(cards.roasBilled).toBeCloseTo(1.19, 2);
    expect(cards.roasGenerated).toBeCloseTo(2.76, 2);
  });

  it("covers only this year while every record was registered this year", () => {
    const cards = impulsaCards(data, totalsWith());
    expect([cards.generatedFrom, cards.generatedTo]).toEqual([2026, 2026]);
    expect(cards.generatedEur).toBe(totalsWith().firstYearEur);
  });

  it("leaves the excluded and cancelled rows out of every sum", () => {
    expect(totalsWith().counted).toBe(109);
    expect(file.records.length).toBe(113);
  });
});

describe("the weekly series", () => {
  it("adds up to the billed total of the file", () => {
    const totals = impulsaWeeksTotals(impulsaWeeks(data, null));
    expect(totals.oneOffEur + totals.recurringEur).toBe(7868);
    expect(totals.oneOffCount + totals.recurringCount).toBe(data.registrations.count);
  });

  it("cuts to the chosen period, keeping a week that overlaps it", () => {
    const weeks = impulsaWeeks(data, { since: "2026-11-01", until: "2026-11-11" });
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weeks[0].longLabel).toBe("setmana del 26/10 al 01/11");
  });
});
