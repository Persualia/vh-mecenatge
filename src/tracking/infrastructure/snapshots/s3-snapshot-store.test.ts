import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { S3SnapshotStore } from "./s3-snapshot-store";

vi.mock("server-only", () => ({}));

function fakeBucket() {
  const objects = new Map<string, string>();
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key!);
      if (body === undefined) throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      return { Body: { transformToString: async () => body } };
    }
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key!, String(command.input.Body));
      return {};
    }
    throw new Error("unexpected command");
  });
  return { objects, s3: { send } as never };
}

describe("S3SnapshotStore", () => {
  it("reads nothing while the object does not exist", async () => {
    const { s3 } = fakeBucket();
    expect(await new S3SnapshotStore(s3, "bucket", "vhir/").read("meta-ad-accounts")).toBeNull();
  });

  it("keeps each source as one object under snapshots/", async () => {
    const { s3, objects } = fakeBucket();
    const store = new S3SnapshotStore(s3, "bucket", "vhir/");
    await store.write("stockcrowd-donations-27041", { savedAt: "2026-11-27T10:00:00.000Z", data: [{ id: "1" }] });
    expect([...objects.keys()]).toEqual(["vhir/snapshots/stockcrowd-donations-27041.json"]);
    expect(await store.read("stockcrowd-donations-27041")).toEqual({ savedAt: "2026-11-27T10:00:00.000Z", data: [{ id: "1" }] });
  });
});
