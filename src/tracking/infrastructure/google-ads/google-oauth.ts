import "server-only";

/**
 * Access tokens from a refresh token, kept until a minute before they expire. The OAuth
 * client must be published ("In production"): a client in "Testing" mode issues refresh
 * tokens that Google revokes after seven days.
 */
export class GoogleOAuth {
  private token: { value: Promise<string>; expires: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  accessToken(): Promise<string> {
    if (this.token && this.token.expires > this.now()) return this.token.value;
    const value = this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: "refresh_token" }),
      cache: "no-store",
    }).then(async (response) => {
      const body = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string; error?: string } | null;
      if (!response.ok || !body?.access_token) {
        throw new Error(`Google no ha renovat el token (${response.status}): ${body?.error_description || body?.error || response.statusText}`);
      }
      if (this.token) this.token.expires = this.now() + ((body.expires_in ?? 3600) - 60) * 1000;
      return body.access_token;
    });
    this.token = { value, expires: this.now() + 50 * 60_000 };
    value.catch(() => {
      this.token = null;
    });
    return value;
  }
}
