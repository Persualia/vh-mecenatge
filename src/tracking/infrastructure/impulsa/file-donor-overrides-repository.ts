import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DonorOverridesRepository } from "@/tracking/application/ports/donor-overrides-repository";
import type { DonorOverride, DonorOverrides } from "@/tracking/domain/donors";

/**
 * Keeps the hand corrections in one JSON file beside the app, so everyone looking at the same
 * instance sees the same figures. The contract version writes them to StockCrowd instead, by
 * swapping this adapter.
 */
export class FileDonorOverridesRepository implements DonorOverridesRepository {
  private readonly path: string;
  /** Writes are serialised: two edits sent at once must not lose one another. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(path = process.env.VHIR_OVERRIDES_FILE || resolve(process.cwd(), "data", "impulsa-overrides.json")) {
    this.path = path;
  }

  async load(): Promise<DonorOverrides> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8"));
      return typeof parsed === "object" && parsed !== null ? (parsed as DonorOverrides) : {};
    } catch (error) {
      // No file yet means nothing has been corrected.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async save(ref: string, override: DonorOverride): Promise<DonorOverrides> {
    const run = this.queue.then(async () => {
      const all = await this.load();
      const empty = override.channel === undefined && override.state === undefined && !override.years;
      if (empty) delete all[ref];
      else all[ref] = override;

      await mkdir(dirname(this.path), { recursive: true });
      // Write beside the file and move it into place, so a crash never leaves half a file.
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(all, null, 2) + "\n");
      await rename(temporary, this.path);
      return all;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
