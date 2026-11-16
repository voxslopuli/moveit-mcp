export class ConfigError extends Error {}

export interface Config {
  baseUrl: string;
  username: string;
  password: string;
  serverHost?: string;
  caFile?: string;
  tlsRejectUnauthorized: boolean;
}

const REQUIRED_KEYS = [
  'MOVEIT_BASE_URL',
  'MOVEIT_USERNAME',
  'MOVEIT_PASSWORD',
] as const;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const [baseUrl, username, password] = REQUIRED_KEYS.map(
    (key) => env[key] as string,
  );
  const tlsRaw = env.MOVEIT_TLS_REJECT_UNAUTHORIZED;

  return {
    baseUrl: baseUrl
      .replace(/\/+$/, '')
      .replace(/\/api\/v1$/i, '')
      .replace(/\/+$/, ''),
    username,
    password,
    serverHost: env.MOVEIT_SERVER_HOST,
    caFile: env.MOVEIT_CA_FILE,
    tlsRejectUnauthorized: tlsRaw?.toLowerCase() !== 'false',
  };
}
