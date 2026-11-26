import "server-only";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { DonorOverridesRepository } from "@/tracking/application/ports/donor-overrides-repository";
import type { DonorOverride, DonorOverrides } from "@/tracking/domain/donors";

export const OVERRIDES_FILE_NAME = "impulsa-overrides.json";
const MAX_ATTEMPTS = 5;

type S3Sender = Pick<S3Client, "send">;

interface Snapshot {
  overrides: DonorOverrides;
  /** null while the object does not exist yet. */
  etag: string | null;
}

/**
 * Keeps the hand corrections as one JSON object in S3, so the deployed app holds no state of its
 * own. Each write is conditional on the version it read: if another instance wrote in between,
 * S3 refuses it and the edit is applied again on top of the newer version.
 */
export class S3DonorOverridesRepository implements DonorOverridesRepository {
  /** Writes from this process are serialised, so they never race one another. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly s3: S3Sender,
    private readonly bucket: string,
    private readonly key: string,
    /** What to start from while the object does not exist yet: the corrections versioned in git. */
    private readonly seed: () => Promise<DonorOverrides> = async () => ({}),
  ) {}

  async load(): Promise<DonorOverrides> {
    return (await this.read()).overrides;
  }

  async save(ref: string, override: DonorOverride): Promise<DonorOverrides> {
    const run = this.queue.then(async () => {
      for (let attempt = 1; ; attempt++) {
        const { overrides: all, etag } = await this.read();
        const empty = override.channel === undefined && override.state === undefined && !override.years;
        if (empty) delete all[ref];
        else all[ref] = override;

        try {
          await this.s3.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: this.key,
              Body: JSON.stringify(all, null, 2) + "\n",
              ContentType: "application/json",
              ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
            }),
          );
          return all;
        } catch (error) {
          if (!isConflict(error) || attempt >= MAX_ATTEMPTS) throw error;
        }
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<Snapshot> {
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.key }));
      const parsed = JSON.parse((await response.Body?.transformToString()) ?? "{}");
      const overrides = typeof parsed === "object" && parsed !== null ? (parsed as DonorOverrides) : {};
      return { overrides, etag: response.ETag ?? null };
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { overrides: await this.seed(), etag: null };
    }
  }
}

const statusOf = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
const nameOf = (error: unknown) => (error as { name?: string })?.name;

const isMissing = (error: unknown) => nameOf(error) === "NoSuchKey" || statusOf(error) === 404;
/** 412: the object changed since it was read. 409: another conditional write was in flight. */
const isConflict = (error: unknown) => statusOf(error) === 412 || statusOf(error) === 409;
