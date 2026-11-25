export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
  }

  /** Meta's opaque failure on queries that take too long: asking for less usually works. */
  get isTooMuchData() {
    return this.code === 1 || this.message.includes("reduce the amount of data");
  }

  get isTransient() {
    return this.code === 2 || this.code === 4 || this.code === 17 || this.code === 613 || this.code === 80000 || this.code === 80004;
  }
}

export interface GraphClientConfig {
  accessToken: string;
  version: string;
  /** Requests in flight at once, across every account. */
  concurrency: number;
}

interface Page<T> {
  data: T[];
  paging?: { next?: string };
}

const RETRY_DELAYS_MS = [1000, 4000];

export class GraphClient {
  private readonly baseUrl: string;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly config: GraphClientConfig) {
    this.baseUrl = `https://graph.facebook.com/${config.version}`;
  }

  get<T>(path: string, params: Record<string, string>): Promise<T> {
    return this.request(`${this.baseUrl}/${path}?${new URLSearchParams(params)}`);
  }

  /** Every page of a list edge. */
  async getAll<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined = `${this.baseUrl}/${path}?${new URLSearchParams(params)}`;
    while (url) {
      const page: Page<T> = await this.request(url);
      items.push(...page.data);
      url = page.paging?.next;
    }
    return items;
  }

  private async request<T>(url: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.limited(() => this.send<T>(url));
      } catch (error) {
        const retry = error instanceof MetaApiError && error.isTransient && attempt < RETRY_DELAYS_MS.length;
        if (!retry) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private async send<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${this.config.accessToken}` }, cache: "no-store" });
    const body = await response.json();
    if (body.error) throw new MetaApiError(body.error.error_user_msg ?? body.error.message, body.error.code, body.error.error_subcode);
    return body;
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.config.concurrency) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
