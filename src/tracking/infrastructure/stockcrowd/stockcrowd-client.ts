import "server-only";

/** The envelope every StockCrowd endpoint answers with. */
interface Envelope<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: { status?: number; error?: { code?: string; message?: string } } | null;
}

export interface Page<T> {
  results: T[];
  meta?: { page: number; size: number; total_elements: number; total_pages: number };
}

/**
 * Thin client for StockCrowd's REST API. Documented at
 * https://api.stockcrowd.com/donors/swagger-ui/index.html: the organisation key goes in the
 * `x-api-key` header; listings are POSTs whose body carries the filter and the page.
 */
export class StockCrowdClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "x-api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;
    if (!response.ok || !envelope?.success || envelope.data === undefined) {
      const detail = envelope?.error?.error?.message || envelope?.message || response.statusText;
      throw new Error(`StockCrowd ha respost ${response.status} a ${path}: ${detail}`);
    }
    return envelope.data;
  }

  /** Every page of a listing. `page` counts from 0 and goes in the body. */
  async postAll<T>(path: string, filter: Record<string, unknown>, pageSize = 500): Promise<T[]> {
    const all: T[] = [];
    for (let page = 0; ; page++) {
      const data = await this.post<Page<T>>(path, { ...filter, page, page_size: pageSize });
      all.push(...data.results);
      const total = data.meta?.total_elements ?? all.length;
      if (all.length >= total || data.results.length === 0) return all;
    }
  }
}
