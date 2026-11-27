import { describe, expect, it, vi } from "vitest";
import type { SourceRead } from "@/tracking/application/ports/fetch-options";
import type { Snapshot, SnapshotStore } from "@/tracking/application/ports/snapshot-store";
import { SnapshottedSource } from "./snapshotted-source";

function memoryStore(initial?: Snapshot<number>) {
  const objects = new Map<string, Snapshot<unknown>>(initial ? [["n", initial]] : []);
  const store = {
    failWrites: false,
    read: vi.fn(async (name: string) => objects.get(name) ?? null),
    write: vi.fn(async (name: string, snapshot: Snapshot<unknown>) => {
      if (store.failWrites) throw new Error("AccessDenied");
      objects.set(name, snapshot);
    }),
  } as unknown as SnapshotStore & { failWrites: boolean };
  return { store, objects };
}

const SAVED: Snapshot<number> = { savedAt: "2026-11-20T08:00:00.000Z", data: 1 };
const settings = { name: "n", label: "Font", source: "impulsa" as const };
const NOW = Date.parse("2026-11-27T10:00:00.000Z");

describe("SnapshottedSource", () => {
  it("returns the saved copy without asking the API", async () => {
    const { store } = memoryStore(SAVED);
    const live = vi.fn(async () => 2);
    const reads: SourceRead[] = [];
    expect(await new SnapshottedSource(store, settings).read(live, { reads })).toBe(1);
    expect(live).not.toHaveBeenCalled();
    expect(reads).toEqual([{ source: "impulsa", label: "Font", savedAt: SAVED.savedAt }]);
  });

  it("asks the API and saves it while there is no copy yet", async () => {
    const { store, objects } = memoryStore();
    const source = new SnapshottedSource<number>(store, settings, 60_000, () => NOW);
    expect(await source.read(async () => 2)).toBe(2);
    expect(objects.get("n")).toEqual({ savedAt: "2026-11-27T10:00:00.000Z", data: 2 });
  });

  it("asks the API on a fresh read and replaces the copy", async () => {
    const { store, objects } = memoryStore(SAVED);
    const source = new SnapshottedSource<number>(store, settings, 60_000, () => NOW);
    expect(await source.read(async () => 1).then(() => source.read(async () => 3, { fresh: true }))).toBe(3);
    expect(objects.get("n")?.data).toBe(3);
  });

  it("keeps the copy, and says why, when the API fails on a refresh", async () => {
    const { store } = memoryStore(SAVED);
    const reads: SourceRead[] = [];
    const value = await new SnapshottedSource<number>(store, settings).read(
      async () => {
        throw new Error("401 token caducat");
      },
      { fresh: true, reads },
    );
    expect(value).toBe(1);
    expect(reads[0]).toMatchObject({ savedAt: SAVED.savedAt, error: expect.stringContaining("401 token caducat") });
  });

  it("fails when the API fails and there is no copy to fall back on", async () => {
    const { store } = memoryStore();
    const failing = async () => {
      throw new Error("down");
    };
    await expect(new SnapshottedSource<number>(store, settings).read(failing, { fresh: true })).rejects.toThrow("down");
  });

  it("still returns what the API read when the copy cannot be saved", async () => {
    const { store } = memoryStore(SAVED);
    store.failWrites = true;
    const reads: SourceRead[] = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await new SnapshottedSource<number>(store, settings).read(async () => 5, { fresh: true, reads })).toBe(5);
    expect(reads[0].error).toContain("AccessDenied");
  });

  it("shares one API read between the calls of the same refresh", async () => {
    const { store } = memoryStore(SAVED);
    const live = vi.fn(async () => 4);
    const source = new SnapshottedSource<number>(store, settings);
    await Promise.all([source.read(live, { fresh: true }), source.read(live, { fresh: true }), source.read(live)]);
    expect(live).toHaveBeenCalledTimes(1);
  });
});
