import { describe, expect, it } from "vitest";
import { donorKeyOf, toDonation, type StockCrowdTransaction } from "./transaction-mapper";

const tx = (over: Partial<StockCrowdTransaction>): StockCrowdTransaction => ({
  id: 4920059,
  recurrence: "Z01",
  status: { name: "succeeded" },
  amounts: { total_charged: 25 },
  gateway: { name: "Stripe" },
  creation_date: "2026-07-02T10:15:00.000+02:00",
  donor: { email: "Someone@Example.org" },
  ...over,
});

describe("a StockCrowd transaction", () => {
  it("becomes a donation with the day it was made in Spain", () => {
    expect(toDonation(tx({}), "s")).toMatchObject({ id: "4920059", date: "2026-07-02", amount: 25, frequency: "Mensual", status: "charged", system: "Donaciones" });
  });

  it("reads every recurrence code StockCrowd uses", () => {
    expect(["Z00", "Z01", "Z02", "Z04"].map((r) => toDonation(tx({ recurrence: r }), "s")?.frequency)).toEqual(["Puntual", "Mensual", "Trimestral", "Anual"]);
    expect(toDonation(tx({ recurrence: "Z99" }), "s")).toBeNull();
  });

  it("marks the CRM's bank-detail captures as pledged and collected by the CRM", () => {
    expect(toDonation(tx({ status: { name: "crm_data_succeeded" }, gateway: { name: "CRM" } }), "s")).toMatchObject({ status: "pledged", system: "CRM" });
  });

  it("leaves failed, expired and abandoned checkouts as other", () => {
    for (const name of ["failed", "expired", "abandoned", "voided"]) expect(toDonation(tx({ status: { name } }), "s")?.status).toBe("other");
  });

  it("carries no personal field, only an opaque key that is the same for the same donor", () => {
    const a = toDonation(tx({}), "s")!;
    const b = toDonation(tx({ id: 2, donor: { email: " someone@example.org " } }), "s")!;
    expect(JSON.stringify(a)).not.toMatch(/@|example/i);
    expect(a.donorKey).toBe(b.donorKey);
    expect(toDonation(tx({ donor: { email: "other@example.org" } }), "s")!.donorKey).not.toBe(a.donorKey);
  });

  it("hashes a typed e-mail to the same key, whatever its case or spaces", () => {
    expect(donorKeyOf("  SOMEONE@example.org ", "s")).toBe(toDonation(tx({}), "s")!.donorKey);
    expect(donorKeyOf("someone@example.org", "other salt")).not.toBe(toDonation(tx({}), "s")!.donorKey);
  });

  it("never lets a record without an e-mail be found by one", () => {
    const anonymous = toDonation(tx({ donor: { email: "" } }), "s")!;
    expect(anonymous.donorKey).not.toBe(donorKeyOf("", "s"));
  });
});
