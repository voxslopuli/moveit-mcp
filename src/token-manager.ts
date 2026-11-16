import type { Config } from './config.js';
import { redactPrivateIps } from './redact.js';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

interface TokenError {
  error: string;
  error_description?: string;
}

const REFRESH_MARGIN_MS = 60_000;

/**
 * Manages OAuth password/refresh token lifecycle for MOVEit.
 *
 * Note: `cfg.tlsRejectUnauthorized` is informational here — TLS enforcement
 * belongs to the HTTP client / entrypoint layer. This class never mutates
 * global agent state.
 */
async function throwTokenError(res: Response): Promise<never> {
  let message = `Token request failed with status ${res.status}`;
  try {
    const err = (await res.json()) as TokenError;
    // Never include credential or token values in the message.
    if (err.error_description) {
      message = err.error_description;
    } else if (err.error) {
      message = err.error;
    }
  } catch {
    // keep default status message
  }
  throw new Error(redactPrivateIps(message));
}

export class TokenManager {
  private readonly cfg: Config;
  private readonly fetchImpl: typeof fetch;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt = 0;

  private readonly dispatcher: unknown;

  constructor(
    cfg: Config,
    fetchImpl: typeof fetch = fetch,
    opts?: { dispatcher?: unknown }
  ) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
    this.dispatcher = opts?.dispatcher;
  }

  /** fetch init with the optional undici dispatcher merged in. */
  private init(base: RequestInit): RequestInit {
    if (this.dispatcher === undefined) {
      return base;
    }
    return { ...base, dispatcher: this.dispatcher } as RequestInit;
  }

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      await this.refresh();
    } else {
      await this.passwordGrant();
    }
    return this.accessToken as string;
  }

  invalidate(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = 0;
  }

  async revoke(): Promise<void> {
    if (!this.accessToken) {
      return;
    }
    const body = new URLSearchParams({ token: this.accessToken });
    const res = await this.fetchImpl(
      `${this.cfg.baseUrl}/api/v1/token/revoke`,
      this.init({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
    );
    if (!res.ok) {
      throw new Error(`Token revocation failed with status ${res.status}`);
    }
    this.invalidate();
  }

  private async passwordGrant(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'password',
      username: this.cfg.username,
      password: this.cfg.password,
    });
    if (this.cfg.serverHost !== undefined) {
      body.set('server_host', this.cfg.serverHost);
    }
    await this.request(body);
  }

  private async refresh(): Promise<void> {
    const { refreshToken } = this;
    this.invalidate();
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken as string,
    });
    await this.request(body);
  }

  private async request(body: URLSearchParams): Promise<void> {
    const res = await this.fetchImpl(
      `${this.cfg.baseUrl}/api/v1/token`,
      this.init({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
    );
    if (!res.ok) {
      await throwTokenError(res);
    }
    const data = (await res.json()) as TokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
  }
}
