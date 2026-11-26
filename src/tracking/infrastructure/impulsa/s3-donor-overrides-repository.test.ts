import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3DonorOverridesRepository } from "./s3-donor-overrides-repository";

vi.mock("server-only", () => ({}));

const s3Error = (name: string, status: number) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

/** An in-memory bucket holding one object, honouring If-Match / If-None-Match like S3. */
function fakeBucket(initial?: string) {
  const state = { body: initial ?? null, version: initial ? 1 : 0, puts: 0 };
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof GetObjectCommand) {
      if (state.body === null) throw s3Error("NoSuchKey", 404);
      const body = state.body;
      return { Body: { transformToString: async () => body }, ETag: `"v${state.version}"` };
    }
    if (command instanceof PutObjectCommand) {
      const { IfMatch, IfNoneMatch, Body } = command.input;
      if (IfNoneMatch === "*" && state.body !== null) throw s3Error("PreconditionFailed", 412);
      if (IfMatch && IfMatch !== `"v${state.version}"`) throw s3Error("PreconditionFailed", 412);
      state.body = String(Body);
      state.version++;
      state.puts++;
      return {};
    }
    throw new Error("unexpected command");
  });
  return { state, s3: { send } as never };
}

describe("S3DonorOverridesRepository", () => {
  it("starts from the seed while the object does not exist", async () => {
    const { s3 } = fakeBucket();
    const repo = new S3DonorOverridesRepository(s3, "bucket", "data/x.json", async () => ({ A: { channel: "google" } }));
    expect(await repo.load()).toEqual({ A: { channel: "google" } });
  });

  it("creates the object from the seed on the first save", async () => {
    const { s3, state } = fakeBucket();
    const repo = new S3DonorOverridesRepository(s3, "bucket", "data/x.json", async () => ({ A: { channel: "google" } }));
    await repo.save("B", { channel: "newsletter" });
    expect(JSON.parse(state.body!)).toEqual({ A: { channel: "google" }, B: { channel: "newsletter" } });
  });

  it("clears a record when the override is empty", async () => {
    const { s3, state } = fakeBucket(JSON.stringify({ A: { channel: "google" }, B: { state: "Cancel·lada" } }));
    const repo = new S3DonorOverridesRepository(s3, "bucket", "k");
    expect(await repo.save("A", {})).toEqual({ B: { state: "Cancel·lada" } });
    expect(JSON.parse(state.body!)).toEqual({ B: { state: "Cancel·lada" } });
  });

  it("keeps every edit when saves are sent at once", async () => {
    const { s3, state } = fakeBucket("{}");
    const repo = new S3DonorOverridesRepository(s3, "bucket", "k");
    await Promise.all([repo.save("A", { channel: "google" }), repo.save("B", { channel: "meta" })]);
    expect(Object.keys(JSON.parse(state.body!)).sort()).toEqual(["A", "B"]);
  });

  it("reapplies the edit when another instance wrote in between", async () => {
    const bucket = fakeBucket("{}");
    const realSend = bucket.s3 as unknown as { send: ReturnType<typeof vi.fn> };
    const original = realSend.send.getMockImplementation() as (command: unknown) => Promise<unknown>;
    let interfered = false;
    realSend.send.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand && !interfered) {
        interfered = true;
        bucket.state.body = JSON.stringify({ Other: { channel: "newsletter" } });
        bucket.state.version++;
      }
      return original(command);
    });
    const repo = new S3DonorOverridesRepository(bucket.s3, "bucket", "k");
    expect(await repo.save("A", { channel: "google" })).toEqual({ Other: { channel: "newsletter" }, A: { channel: "google" } });
  });
});
