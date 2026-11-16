/**
 * Redact IPv4 addresses in RFC 1918 private ranges (10/8, 172.16/12,
 * 192.168/16). Public IPs are preserved — they appear in legitimate
 * error diagnostics; private addresses leak server-internal topology.
 */
export function redactPrivateIps(text: string): string {
  return text.replace(
    /\b(?<ip>10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/gu,
    '[redacted-ip]'
  );
}
