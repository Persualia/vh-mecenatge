import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Snapshot, SnapshotStore } from "@/tracking/application/ports/snapshot-store";
import { isSnapshot } from "./s3-snapshot-store";

/** Without a bucket: one JSON file per source in `data/snapshots/`, kept out of git. */
export class FileSnapshotStore implements SnapshotStore {
  constructor(private readonly directory = resolve(process.cwd(), "data", "snapshots")) {}

  async read<T>(name: string): Promise<Snapshot<T> | null> {
    try {
      const parsed = JSON.parse(await readFile(this.pathOf(name), "utf8"));
      return isSnapshot<T>(parsed) ? parsed : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async write<T>(name: string, snapshot: Snapshot<T>): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    // Write beside the file and move it into place, so a crash never leaves half a file.
    const temporary = `${this.pathOf(name)}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(snapshot));
    await rename(temporary, this.pathOf(name));
  }

  private pathOf(name: string) {
    return resolve(this.directory, `${name}.json`);
  }
}
