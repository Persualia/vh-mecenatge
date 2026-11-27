import "server-only";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Snapshot, SnapshotStore } from "@/tracking/application/ports/snapshot-store";

type S3Sender = Pick<S3Client, "send">;

/** One JSON object per source under `<prefix>snapshots/`. The last refresh wins. */
export class S3SnapshotStore implements SnapshotStore {
  constructor(
    private readonly s3: S3Sender,
    private readonly bucket: string,
    /** Empty, or ending in "/". */
    private readonly prefix: string,
  ) {}

  async read<T>(name: string): Promise<Snapshot<T> | null> {
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.keyOf(name) }));
      const parsed = JSON.parse((await response.Body?.transformToString()) ?? "null");
      return isSnapshot<T>(parsed) ? parsed : null;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async write<T>(name: string, snapshot: Snapshot<T>): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.keyOf(name), Body: JSON.stringify(snapshot), ContentType: "application/json" }),
    );
  }

  private keyOf(name: string) {
    return `${this.prefix}snapshots/${name}.json`;
  }
}

export const isSnapshot = <T>(value: unknown): value is Snapshot<T> =>
  typeof value === "object" && value !== null && typeof (value as Snapshot<T>).savedAt === "string" && "data" in value;

const isMissing = (error: unknown) => {
  const { name, $metadata } = (error ?? {}) as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === "NoSuchKey" || $metadata?.httpStatusCode === 404;
};
