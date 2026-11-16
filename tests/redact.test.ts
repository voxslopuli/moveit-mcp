import { describe, expect, it } from 'vitest';
import { redactPrivateIps } from '../src/redact.js';

describe('redactPrivateIps', () => {
  it('redacts 10.x addresses', () => {
    expect(redactPrivateIps('host 10.0.24.56 down')).toBe(
      'host [redacted-ip] down'
    );
  });

  it('redacts 172.16-31.x addresses', () => {
    expect(redactPrivateIps('connect 172.16.4.9')).toBe(
      'connect [redacted-ip]'
    );
    expect(redactPrivateIps('connect 172.31.255.255')).toBe(
      'connect [redacted-ip]'
    );
  });

  it('redacts 192.168.x addresses', () => {
    expect(redactPrivateIps('at 192.168.1.1:9443')).toBe(
      'at [redacted-ip]:9443'
    );
  });

  it('leaves public IPs untouched', () => {
    expect(redactPrivateIps('host 170.158.0.56 unreachable')).toBe(
      'host 170.158.0.56 unreachable'
    );
    expect(redactPrivateIps('host 172.15.0.1 and 172.32.0.1')).toBe(
      'host 172.15.0.1 and 172.32.0.1'
    );
  });

  it('leaves text without IPs unchanged', () => {
    expect(redactPrivateIps('no addresses here')).toBe('no addresses here');
  });

  it('redacts every occurrence', () => {
    expect(redactPrivateIps('10.1.1.1 then 192.168.0.2 then 10.2.3.4')).toBe(
      '[redacted-ip] then [redacted-ip] then [redacted-ip]'
    );
  });
});
