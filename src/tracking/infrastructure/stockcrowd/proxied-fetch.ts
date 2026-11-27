import "server-only";
import { ProxyAgent, fetch as undiciFetch } from "undici";

/**
 * A `fetch` that leaves through an HTTP proxy, so StockCrowd sees a fixed IP it can allow even
 * when the app runs on a host whose egress IP changes (Vercel). HTTPS goes through a CONNECT
 * tunnel, so the proxy never sees the key or the donors. Uses undici's own `fetch`, because
 * Node's built-in one may reject a dispatcher from a different undici version.
 */
export function proxiedFetch(proxyUrl: string): typeof fetch {
  const dispatcher = new ProxyAgent(proxyUrl);
  return ((input: string | URL, init?: RequestInit) =>
    undiciFetch(input, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher })) as unknown as typeof fetch;
}
