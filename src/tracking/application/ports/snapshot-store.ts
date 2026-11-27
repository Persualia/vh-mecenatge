/** What a source's API returned, and when. */
export interface Snapshot<T> {
  savedAt: string;
  data: T;
}

/** Where the last read of each source is kept, so the board opens without asking the APIs. */
export interface SnapshotStore {
  /** null while nothing has been saved under this name. */
  read<T>(name: string): Promise<Snapshot<T> | null>;
  write<T>(name: string, snapshot: Snapshot<T>): Promise<void>;
}
