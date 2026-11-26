import { describe, expect, it } from "vitest";
import recordsFile from "../data/impulsa-records.json";
import { donorTotals, resolveRow, resolveRows, sanitiseOverride, searchRows, yearColumns, type DonorOverrides, type DonorRecord, type DonorRecordsFile } from "./donors";

const file = recordsFile as DonorRecordsFile;
const TODAY = "2026-11-25";

const monthly: DonorRecord = {
  ref: "R-001", date: "2026-07-02", system: "CRM", channel: "meta", base: 25, frequency: "Mensual",
  instalments: 12, recurring: true, state: "Inclòs", included: true, billedEur: 125, firstYearEur: 300,
};
const oneOff: DonorRecord = {
  ref: "R-002", date: "2026-07-04", system: "Donaciones", channel: "google", base: 50, frequency: "Puntual",
  instalments: 1, recurring: false, state: "Inclòs", included: true, billedEur: 50, firstYearEur: 50,
};

const years = [2026, 2027];
const row = (record: DonorRecord, override = {}) => resolveRow(record, override, years, TODAY);

describe("the year columns", () => {
  it("runs from the first registration to one year past today, so next year is always there", () => {
    expect(yearColumns(file.records, {}, TODAY)).toEqual([2026, 2027]);
  });

  it("opens a column as soon as someone writes in a later year", () => {
    expect(yearColumns(file.records, { "R-001": { years: { "2029": { unpaid: 1 } } } }, TODAY)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });
});

describe("a record's years", () => {
  it("counts in the first calendar year only the instalments left from the month of registration", () => {
    const cells = row(monthly).years;
    // Registered in July: July to December, six instalments.
    expect(cells[0]).toMatchObject({ year: 2026, quota: 25, instalments: 6, unpaid: 0, value: 150 });
  });

  it("works the instalments left out of the frequency", () => {
    const first = (date: string, frequency: string, instalments: number) =>
      row({ ...monthly, date, frequency, instalments }).years[0].instalments;
    expect(first("2026-01-15", "Mensual", 12)).toBe(12);
    expect(first("2026-12-01", "Mensual", 12)).toBe(1);
    expect(first("2026-07-02", "Trimestral", 4)).toBe(2);
    expect(first("2026-11-02", "Trimestral", 4)).toBe(1);
    expect(first("2026-11-02", "Anual", 1)).toBe(1);
    expect(row({ ...oneOff, date: "2026-11-02" }).years[0].instalments).toBe(1);
  });

  it("owes nothing in a year before it was registered", () => {
    expect(row({ ...monthly, date: "2027-03-01" }).years[0]).toMatchObject({ year: 2026, instalments: 0, value: 0 });
  });

  it("keeps the first-year figure at the criterion, whatever the month of registration", () => {
    expect(row(monthly).firstYearValue).toBe(300);
    expect(row(oneOff).firstYearValue).toBe(50);
  });

  it("carries a recurring gift into the next year and leaves a one-off at nothing", () => {
    expect(row(monthly).years[1]).toMatchObject({ year: 2027, instalments: 12, value: 300 });
    expect(row(oneOff).years[1]).toMatchObject({ year: 2027, instalments: 0, value: 0 });
  });

  it("takes a different amount for next year, which is what the column is for", () => {
    const edited = row(monthly, { years: { "2027": { quota: 40 } } });
    expect(edited.years[0].value).toBe(150);
    expect(edited.years[1].value).toBe(480);
    expect(edited.years[1].edited).toBe(true);
  });

  it("subtracts the instalments marked unpaid that year", () => {
    expect(row(monthly, { years: { "2027": { unpaid: 3 } } }).years[1].value).toBe(225);
  });

  it("never lets more instalments go unpaid than are due", () => {
    expect(row(monthly, { years: { "2026": { unpaid: 99 } } }).years[0]).toMatchObject({ unpaid: 6, value: 0 });
  });

  it("takes an unpaid instalment of a year that has happened off what was invoiced", () => {
    expect(row(monthly, { years: { "2026": { unpaid: 2 } } }).billedEffective).toBe(75);
    // A year still to come cannot change what has already been invoiced.
    expect(row(monthly, { years: { "2027": { unpaid: 2 } } }).billedEffective).toBe(125);
  });

  it("drops a record out of every figure once it is excluded", () => {
    const excluded = row(monthly, { state: "Cancel·lada" });
    expect(excluded.counts).toBe(false);
    expect([excluded.billedEffective, excluded.years[0].value]).toEqual([0, 0]);
  });
});

describe("the totals behind the cards", () => {
  const base = donorTotals(resolveRows(file.records, {}, years, TODAY), years, TODAY);

  it("reproduces the file's own figures when nothing has been corrected", () => {
    expect(base.billedEur).toBe(7868);
    expect(base.firstYearEur).toBe(18213);
  });

  it("counts in 2026 only what falls in 2026, below the first-year figure", () => {
    expect(base.byYear[2026]).toBe(9254);
    expect(base.byYear[2026]).toBeLessThan(base.firstYearEur);
  });

  it("projects a full next year below the first-year figure, because the one-off gifts do not come back", () => {
    expect(base.byYear[2027]).toBe(16042);
    expect(base.byYear[2027]).toBeLessThan(base.firstYearEur);
  });

  it("moves the figures when a correction is made", () => {
    const record = file.records.find((r) => r.included && r.recurring)!;
    const due = resolveRow(record, undefined, years, TODAY).years[0].instalments;
    const overrides: DonorOverrides = { [record.ref]: { years: { "2026": { unpaid: 99 } } } };
    const edited = donorTotals(resolveRows(file.records, overrides, years, TODAY), years, TODAY);
    expect(edited.firstYearEur).toBeLessThan(base.firstYearEur);
    expect(edited.byYear[2026]).toBeLessThan(base.byYear[2026]);
    expect(edited.edited).toBe(1);
    expect(edited.unpaidInstalments).toBe(due);
  });

  it("follows a change of traffic source into the channel split", () => {
    const first = file.records.find((r) => r.included && r.channel === "meta")!;
    const moved = donorTotals(resolveRows(file.records, { [first.ref]: { channel: "google" } }, years, TODAY), years, TODAY);
    const meta = moved.byChannel.find((c) => c.key === "meta")!;
    expect(meta.count).toBe(102);
    expect(moved.byChannel.find((c) => c.key === "google")!.count).toBe(5);
  });
});

describe("the order of the rows", () => {
  it("follows the date of the first gift, most recent first, whatever the order on file", () => {
    const later: DonorRecord = { ...monthly, ref: "R-010", date: "2026-09-01" };
    const sameDay: DonorRecord = { ...oneOff, ref: "R-009", date: "2026-07-02" };
    expect(resolveRows([later, oneOff, sameDay, monthly], {}, years, TODAY).map((r) => r.ref)).toEqual(["R-010", "R-002", "R-009", "R-001"]);
  });
});

describe("the search", () => {
  const rows = resolveRows(file.records, {}, years, TODAY);

  it("finds a record by its reference, its date or its origin", () => {
    expect(searchRows(rows, "R-001").map((r) => r.ref)).toEqual(["R-001"]);
    expect(searchRows(rows, "02/07/2026").length).toBeGreaterThan(0);
    expect(searchRows(rows, "google").every((r) => r.channelName === "Google Ads")).toBe(true);
  });

  it("needs every word to match, so two terms narrow instead of widen", () => {
    const one = searchRows(rows, "mensual");
    expect(searchRows(rows, "mensual google").length).toBeLessThan(one.length);
  });

  it("gives everything back for an empty search", () => {
    expect(searchRows(rows, "   ").length).toBe(rows.length);
  });
});

describe("what may be written", () => {
  it("accepts the fields the Unitat de Mecenatge may set", () => {
    expect(sanitiseOverride({ channel: "google", state: "Cancel·lada", years: { "2027": { quota: 30, unpaid: 2 } } })).toEqual({
      channel: "google",
      state: "Cancel·lada",
      years: { "2027": { quota: 30, unpaid: 2 } },
    });
  });

  it("refuses a channel, a state or a year it does not know", () => {
    expect(sanitiseOverride({ channel: "tiktok" })).toBeNull();
    expect(sanitiseOverride({ state: "Potser" })).toBeNull();
    expect(sanitiseOverride({ state: "Exclòs" })).toBeNull();
    expect(sanitiseOverride({ years: { "26": { unpaid: 1 } } })).toBeNull();
  });

  it("refuses an amount or a count that is not a plain positive number", () => {
    expect(sanitiseOverride({ years: { "2027": { quota: -5 } } })).toBeNull();
    expect(sanitiseOverride({ years: { "2027": { unpaid: 1.5 } } })).toBeNull();
    expect(sanitiseOverride({ years: { "2027": { unpaid: -1 } } })).toBeNull();
  });

  it("drops a year that says nothing, so an empty edit clears the record", () => {
    expect(sanitiseOverride({ years: { "2027": {} } })).toEqual({});
  });
});

describe("what the first-year figure covers", () => {
  const years = [2026, 2027, 2028];
  const rows = (today: string) => resolveRows([monthly, oneOff], {}, years, today);

  it("is the first year of every record while they are all from this year", () => {
    const totals = donorTotals(rows("2026-11-25"), years, "2026-11-25");
    expect(totals.generatedEur).toBe(totals.firstYearEur);
    expect([totals.generatedFrom, totals.generatedTo]).toEqual([2026, 2026]);
  });

  it("adds every year a record has run once later years arrive", () => {
    const totals = donorTotals(rows("2028-03-01"), years, "2028-03-01");
    // The monthly gift ran July–December 2026 (150), then 2027 and 2028 (300 each); the one-off only its own year.
    expect(totals.generatedEur).toBe(150 + 300 * 2 + 50);
    expect(totals.firstYearEur).toBe(350);
    expect([totals.generatedFrom, totals.generatedTo]).toEqual([2026, 2028]);
  });

  it("counts a record registered this year as its first year", () => {
    const newcomer: DonorRecord = { ...monthly, ref: "R-003", date: "2028-02-01", billedEur: 25, firstYearEur: 300 };
    const totals = donorTotals(resolveRows([newcomer], {}, years, "2028-03-01"), years, "2028-03-01");
    expect(totals.generatedEur).toBe(300);
  });

  it("leaves the year still to come out of the figure", () => {
    const totals = donorTotals(rows("2027-06-01"), years, "2027-06-01");
    expect(totals.generatedEur).toBe(150 + 300 + 50);
    expect(totals.byYear[2028]).toBe(300); // projected, but not counted as generated
  });

  it("takes the instalments marked unpaid off the year they belong to", () => {
    const withUnpaid = resolveRows([monthly], { "R-001": { years: { "2027": { unpaid: 12 } } } }, years, "2028-03-01");
    expect(donorTotals(withUnpaid, years, "2028-03-01").generatedEur).toBe(150 + 0 + 300);
  });
});
