/** How old the data one source returned is, and why it is older than asked for. */
export interface SourceRead {
  source: "meta" | "impulsa";
  /** What the board calls the source, e.g. "StockCrowd". */
  label: string;
  /** When the data was read from the source's API, ISO 8601. */
  savedAt: string;
  /** Set when the refresh failed, or the copy could not be saved: the data shown is still usable. */
  error?: string;
}

export interface FetchOptions {
  /** Ask the source's API again instead of the saved copy. */
  fresh?: boolean;
  /** Each source adds what it returned here, so the board can say how old the data is. */
  reads?: SourceRead[];
}
