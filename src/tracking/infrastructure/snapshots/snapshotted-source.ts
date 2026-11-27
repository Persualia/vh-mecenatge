import type { FetchOptions, SourceRead } from "@/tracking/application/ports/fetch-options";
import type { Snapshot, SnapshotStore } from "@/tracking/application/ports/snapshot-store";

export interface SnapshottedSourceSettings {
  /** The object the copy is kept under, e.g. "stockcrowd-donations-27041". */
  name: string;
  label: string;
  source: SourceRead["source"];
}

type Result<T> = Snapshot<T> & { error?: string };

interface Memo<T> {
  value: Promise<Result<T>>;
  expires: number;
  /** Read from the API rather than from the saved copy. */
  live: boolean;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * One source read through its saved copy. A normal read returns the copy, and only asks the API
 * while there is none yet. A fresh read asks the API and saves what it returns; if the API fails,
 * the copy is returned with the error, so the board is never left empty by a source being down.
 * One board load asks some sources twice, so a read is shared with the calls made shortly after.
 */
export class SnapshottedSource<T> {
  private memo: Memo<T> | null = null;

  constructor(
    private readonly store: SnapshotStore,
    private readonly settings: SnapshottedSourceSettings,
    private readonly memoMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async read(fetchLive: () => Promise<T>, options?: FetchOptions): Promise<T> {
    const fresh = options?.fresh ?? false;
    const memo = this.memo;
    let pending: Promise<Result<T>>;
    if (memo && memo.expires > this.now() && (memo.live || !fresh)) {
      pending = memo.value;
    } else {
      pending = fresh ? this.refresh(fetchLive) : this.stored(fetchLive);
      const entry: Memo<T> = { value: pending, expires: this.now() + this.memoMs, live: fresh };
      this.memo = entry;
      pending.catch(() => {
        if (this.memo === entry) this.memo = null;
      });
    }

    const { savedAt, data, error } = await pending;
    options?.reads?.push({ source: this.settings.source, label: this.settings.label, savedAt, ...(error ? { error } : {}) });
    return data;
  }

  private async stored(fetchLive: () => Promise<T>): Promise<Result<T>> {
    const saved = await this.readCopy();
    return saved ?? this.refresh(fetchLive);
  }

  private async refresh(fetchLive: () => Promise<T>): Promise<Result<T>> {
    let data: T;
    try {
      data = await fetchLive();
    } catch (error) {
      const saved = await this.readCopy();
      if (!saved) throw error;
      return { ...saved, error: `No s’ha pogut actualitzar: ${messageOf(error)}` };
    }

    const snapshot: Snapshot<T> = { savedAt: new Date(this.now()).toISOString(), data };
    try {
      await this.store.write(this.settings.name, snapshot);
      return snapshot;
    } catch (error) {
      console.error(`No s’ha pogut desar la còpia de ${this.settings.name}:`, error);
      return { ...snapshot, error: `S’ha llegit, però no s’ha pogut desar la còpia: ${messageOf(error)}` };
    }
  }

  /** A copy that cannot be read is treated as missing: the API can still answer. */
  private async readCopy(): Promise<Snapshot<T> | null> {
    try {
      return await this.store.read<T>(this.settings.name);
    } catch (error) {
      console.error(`No s’ha pogut llegir la còpia de ${this.settings.name}:`, error);
      return null;
    }
  }
}
