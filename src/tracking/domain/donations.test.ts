import { describe, expect, it } from "vitest";
import { donorRecordsFromDonations, instalmentsDue, refsOfDonor, type Donation } from "./donations";
import { resolveRow } from "./donors";
import { buildImpulsaAggregate, campaignSpend } from "./impulsa";

const TODAY = "2026-11-12";

const donation = (over: Partial<Donation>): Donation => ({
  id: "1", donorKey: "a", date: "2026-07-02", amount: 25, frequency: "Mensual", status: "charged", system: "Donaciones", ...over,
});

describe("instalments due", () => {
  it("counts the first on signing up and one more each period that starts, as the sheet did", () => {
    expect(instalmentsDue("2026-07-02", "Mensual", TODAY)).toBe(5);
    expect(instalmentsDue("2026-07-31", "Mensual", TODAY)).toBe(5);
    expect(instalmentsDue("2026-07-02", "Trimestral", TODAY)).toBe(2);
    expect(instalmentsDue("2026-07-02", "Anual", TODAY)).toBe(1);
    expect(instalmentsDue("2026-07-02", "Puntual", TODAY)).toBe(1);
  });

  it("is nothing before the gift exists", () => {
    expect(instalmentsDue("2026-12-01", "Mensual", TODAY)).toBe(0);
  });
});

describe("records from the donations platform", () => {
  it("folds a card subscription's monthly charges into one record named by the first", () => {
    const records = donorRecordsFromDonations(
      [donation({ id: "30", date: "2026-09-19" }), donation({ id: "10", date: "2026-07-19" }), donation({ id: "20", date: "2026-08-19" })],
      TODAY,
    );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ ref: "SC-10", date: "2026-07-19", billedEur: 75, billedIsActual: true, firstYearEur: 300, recurring: true });
  });

  it("keeps two donors apart, and two one-offs of the same donor apart", () => {
    const records = donorRecordsFromDonations(
      [
        donation({ id: "1", donorKey: "a" }),
        donation({ id: "2", donorKey: "b" }),
        donation({ id: "3", donorKey: "a", frequency: "Puntual", amount: 50 }),
        donation({ id: "4", donorKey: "a", frequency: "Puntual", amount: 50 }),
      ],
      TODAY,
    );
    expect(records.map((r) => r.ref)).toEqual(["SC-1", "SC-2", "SC-3", "SC-4"]);
  });

  it("bills a CRM direct debit by the calendar, since the platform never sees its instalments", () => {
    const [record] = donorRecordsFromDonations([donation({ status: "pledged", system: "CRM" })], TODAY);
    expect(record).toMatchObject({ system: "CRM", billedEur: 125, billedIsActual: false, state: "Inclòs" });
  });

  it("excludes a refunded gift and leaves out failed or abandoned checkouts", () => {
    const records = donorRecordsFromDonations([donation({ id: "1", frequency: "Puntual", status: "refunded" }), donation({ id: "2", donorKey: "z", status: "other" })], TODAY);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ state: "Exclòs", included: false, billedEur: 0 });
  });

  it("does not take an unpaid instalment off a figure that is already what was charged", () => {
    const [record] = donorRecordsFromDonations([donation({ id: "1" }), donation({ id: "2", date: "2026-08-02" })], TODAY);
    const row = resolveRow(record, { years: { "2026": { unpaid: 1 } } }, [2026, 2027], TODAY);
    expect(row.billedEffective).toBe(50);
    // A monthly gift from July owes six instalments in 2026; one of them went unpaid.
    expect(row.years[0].value).toBe(125);
  });
});

describe("the live aggregate", () => {
  const records = donorRecordsFromDonations(
    [
      donation({ id: "1", date: "2026-07-02", status: "pledged", system: "CRM" }),
      donation({ id: "2", donorKey: "b", date: "2026-07-20", frequency: "Puntual", amount: 100 }),
    ],
    TODAY,
  );
  const aggregate = buildImpulsaAggregate({ records, spend: { metaSpendUsd: 100, googleSpendEur: 50, googleSource: "live", usdToEur: 0.9 }, today: TODAY, sourceName: "StockCrowd" });

  it("adds Meta's spend in euros to Google's", () => {
    expect(aggregate.cards).toMatchObject({ metaSpendEur: 90, spendEur: 140, billedEur: 225, yearValueEur: 400 });
  });

  it("fills every week between the first and the last registration", () => {
    expect(aggregate.weekly.map((w) => w.weekStart)).toEqual(["2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20"]);
    expect(aggregate.weekly[3]).toMatchObject({ oneOffCount: 1, oneOffEur: 100 });
  });

  it("says it is live and cut at today", () => {
    expect(aggregate.source.kind).toBe("live");
    expect(aggregate.cutOff).toBe(TODAY);
  });

  it("sums Meta's spend over the campaigns that belong to the initiative only", () => {
    const dataset = {
      campaigns: [
        { id: "a", accountId: "x", name: "VAL ImpulsaTalent HotLAL1Socis", objective: "", status: "ACTIVE" },
        { id: "b", accountId: "x", name: "PER Menopausa", objective: "", status: "ACTIVE" },
      ],
      rows: [
        { campaignId: "a", date: "2026-07-01", spend: 10.5, impressions: 0, linkClicks: 0, results: {} },
        { campaignId: "a", date: "2026-07-02", spend: 4.5, impressions: 0, linkClicks: 0, results: {} },
        { campaignId: "b", date: "2026-07-02", spend: 99, impressions: 0, linkClicks: 0, results: {} },
      ],
      budgetChanges: [],
    };
    expect(campaignSpend(dataset, (name) => name.includes("ImpulsaTalent"))).toBe(15);
  });
});

describe("the records of one donor", () => {
  it("are the same refs the full table shows for that donor", () => {
    const all = [
      donation({ id: "1" }),
      donation({ id: "2", date: "2026-08-02" }),
      donation({ id: "3", donorKey: "b" }),
      donation({ id: "4", frequency: "Puntual", amount: 100, date: "2026-09-01" }),
    ];
    const table = donorRecordsFromDonations(all, TODAY).map((r) => r.ref);
    expect(refsOfDonor(all, "a", TODAY)).toEqual(["SC-1", "SC-4"]);
    expect(table).toEqual(expect.arrayContaining(["SC-1", "SC-4"]));
    expect(refsOfDonor(all, "nobody", TODAY)).toEqual([]);
  });
});
