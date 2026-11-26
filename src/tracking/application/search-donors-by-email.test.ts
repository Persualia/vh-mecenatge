import { describe, expect, it } from "vitest";
import { SearchDonorsByEmail } from "./search-donors-by-email";
import type { ImpulsaRepository } from "./ports/impulsa-repository";
import { InvalidRequestError } from "./load-tracking-board";

const source = (refs: string[] | null): ImpulsaRepository => ({
  load: async () => { throw new Error("not used"); },
  loadRecords: async () => { throw new Error("not used"); },
  findRefsByEmail: async () => refs,
});

describe("searching donors by e-mail", () => {
  it("returns the refs the source finds", async () => {
    await expect(new SearchDonorsByEmail(source(["SC-1"])).execute("a@b.org", "2026-11-26")).resolves.toEqual(["SC-1"]);
  });

  it("refuses something that is not an address", async () => {
    for (const bad of ["", "nope", "a@b", 42, null, `${"x".repeat(250)}@b.org`]) {
      await expect(new SearchDonorsByEmail(source([])).execute(bad, "2026-11-26")).rejects.toBeInstanceOf(InvalidRequestError);
    }
  });

  it("says so when the source holds no e-mails", async () => {
    await expect(new SearchDonorsByEmail(source(null)).execute("a@b.org", "2026-11-26")).rejects.toThrow(/StockCrowd/);
  });
});
