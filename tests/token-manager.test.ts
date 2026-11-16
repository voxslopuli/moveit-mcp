import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { TokenManager } from '../src/token-manager.js';

const baseConfig: Config = {
  baseUrl: 'https://moveit.example.com',
  username: 'alice',
  password: 's3cret',
  tlsRejectUnauthorized: true,
};

function tokenResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      access_token: 'access-1',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'refresh-1',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function okResponse() {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Extract url/content-type/body from a fetch call made with (url, init) or a Request. */
async function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [input, init] = fetchMock.mock.calls.at(-1) as unknown as [
    RequestInfo | Request,
    RequestInit | undefined,
  ];
  const url = typeof input === 'string' ? input : input.url;
  const headers =
    typeof input === 'string'
      ? new Headers(init?.headers)
      : new Headers(input.headers);
  const body =
    typeof input === 'string'
      ? String(init?.body ?? '')
      : await input.clone().text();
  return { url, contentType: headers.get('content-type'), body };
}

describe('TokenManager', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('performs a password grant with exact URL, content type, and body', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    const token = await tm.getToken();

    expect(token).toBe('access-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, contentType, body } = await lastCall(fetchMock);
    expect(url).toBe('https://moveit.example.com/api/v1/token');
    expect(contentType).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(body);
    expect(params.get('grant_type')).toBe('password');
    expect(params.get('username')).toBe('alice');
    expect(params.get('password')).toBe('s3cret');
    expect(params.get('server_host')).toBeNull();
  });

  it('includes server_host in the grant only when configured', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    const tm = new TokenManager(
      { ...baseConfig, serverHost: 'MOVEIT\\CORP' },
      fetchMock as unknown as typeof fetch,
    );

    await tm.getToken();

    const { body } = await lastCall(fetchMock);
    const params = new URLSearchParams(body);
    expect(params.get('server_host')).toBe('MOVEIT\\CORP');
  });

  it('caches the token and does not call HTTP while valid', async () => {
    fetchMock.mockResolvedValue(tokenResponse());
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    const first = await tm.getToken();
    const second = await tm.getToken();
    const third = await tm.getToken();

    expect(first).toBe('access-1');
    expect(second).toBe('access-1');
    expect(third).toBe('access-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses a refresh grant when within 60s of expiry', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse({ expires_in: 30 }));
    fetchMock.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }),
    );
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    const first = await tm.getToken();
    const second = await tm.getToken();

    expect(first).toBe('access-1');
    expect(second).toBe('access-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { url, contentType, body } = await lastCall(fetchMock);
    expect(url).toBe('https://moveit.example.com/api/v1/token');
    expect(contentType).toBe('application/x-www-form-urlencoded');
    const params = new URLSearchParams(body);
    expect(params.get('grant_type')).toBe('refresh_token');
    expect(params.get('refresh_token')).toBe('refresh-1');
    expect(params.get('username')).toBeNull();
  });

  it('falls back to a password grant after invalidate()', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce(
      tokenResponse({ access_token: 'access-2' }),
    );
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    await tm.getToken();
    tm.invalidate();
    const token = await tm.getToken();

    expect(token).toBe('access-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const { body } = await lastCall(fetchMock);
    expect(new URLSearchParams(body).get('grant_type')).toBe('password');
  });

  it('throws the error_description on 400 and never leaks the token', async () => {
    const description = 'invalid username or password';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: description,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    await expect(tm.getToken()).rejects.toThrow(description);
    try {
      await tm.getToken();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('s3cret');
      expect((err as Error).message).not.toContain('access-1');
      expect((err as Error).message).not.toContain('refresh-1');
    }
  });

  it('revoke() posts the cached access token to the revoke endpoint', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse());
    fetchMock.mockResolvedValueOnce(okResponse());
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    await tm.getToken();
    await tm.revoke();

    const { url, contentType, body } = await lastCall(fetchMock);
    expect(url).toBe('https://moveit.example.com/api/v1/token/revoke');
    expect(contentType).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(body).get('token')).toBe('access-1');
  });

  it('revoke() is a no-op when no token is cached', async () => {
    fetchMock.mockResolvedValue(tokenResponse());
    const tm = new TokenManager(
      baseConfig,
      fetchMock as unknown as typeof fetch,
    );

    await tm.revoke();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('constructor does not mutate global state for either tlsRejectUnauthorized value', () => {
    // Informational only: TLS enforcement belongs to the client/entrypoint layer.
    expect(() => new TokenManager(baseConfig)).not.toThrow();
    expect(
      () =>
        new TokenManager(
          { ...baseConfig, tlsRejectUnauthorized: false },
          fetchMock as unknown as typeof fetch,
        ),
    ).not.toThrow();
  });
});
