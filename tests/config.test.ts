import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const validEnv = {
  MOVEIT_BASE_URL: 'https://moveit.example.com',
  MOVEIT_USERNAME: 'svc-bot',
  MOVEIT_PASSWORD: 'hunter2',
};

describe('loadConfig', () => {
  it('parses all fields from a valid env', () => {
    const cfg = loadConfig({ ...validEnv });
    expect(cfg).toEqual({
      baseUrl: 'https://moveit.example.com',
      username: 'svc-bot',
      password: 'hunter2',
      serverHost: undefined,
      tlsRejectUnauthorized: true,
    });
  });

  it('sets tlsRejectUnauthorized=false only for case-insensitive "false"', () => {
    expect(
      loadConfig({ ...validEnv, MOVEIT_TLS_REJECT_UNAUTHORIZED: 'false' })
        .tlsRejectUnauthorized,
    ).toBe(false);
    expect(
      loadConfig({ ...validEnv, MOVEIT_TLS_REJECT_UNAUTHORIZED: 'FALSE' })
        .tlsRejectUnauthorized,
    ).toBe(false);
  });

  it('defaults tlsRejectUnauthorized=true for other values', () => {
    expect(
      loadConfig({ ...validEnv, MOVEIT_TLS_REJECT_UNAUTHORIZED: 'true' })
        .tlsRejectUnauthorized,
    ).toBe(true);
    expect(
      loadConfig({ ...validEnv, MOVEIT_TLS_REJECT_UNAUTHORIZED: '0' })
        .tlsRejectUnauthorized,
    ).toBe(true);
    expect(loadConfig({ ...validEnv }).tlsRejectUnauthorized).toBe(true);
  });

  it('throws naming all missing vars', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(
      /Missing required environment variables: MOVEIT_BASE_URL, MOVEIT_USERNAME, MOVEIT_PASSWORD/,
    );
  });

  it('strips trailing slash from baseUrl', () => {
    expect(
      loadConfig({
        ...validEnv,
        MOVEIT_BASE_URL: 'https://moveit.example.com/',
      }).baseUrl,
    ).toBe('https://moveit.example.com');
  });

  it('names only the missing BASE_URL when others present', () => {
    expect(() =>
      loadConfig({ MOVEIT_USERNAME: 'u', MOVEIT_PASSWORD: 'p' }),
    ).toThrow('Missing required environment variables: MOVEIT_BASE_URL');
  });

  it('never includes values in the error message', () => {
    try {
      loadConfig({});
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
  });
});
