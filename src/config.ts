export class ConfigError extends Error {}

export interface Config {
  baseUrl: string;
  caFile?: string;
  password: string;
  serverHost?: string;
  tlsRejectUnauthorized: boolean;
  username: string;
}

const TRAILING_SLASH = /\/+$/u;
const API_V1_SUFFIX = /\/api\/v1$/iu;

const REQUIRED_KEYS = [
  'MOVEIT_BASE_URL',
  'MOVEIT_USERNAME',
  'MOVEIT_PASSWORD',
] as const;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const [baseUrl, username, password] = REQUIRED_KEYS.map(
    (key) => env[key] as string
  );
  const tlsRaw = env.MOVEIT_TLS_REJECT_UNAUTHORIZED;

  return {
    baseUrl: baseUrl
      .replace(TRAILING_SLASH, '')
      .replace(API_V1_SUFFIX, '')
      .replace(TRAILING_SLASH, ''),
    username,
    password,
    serverHost: env.MOVEIT_SERVER_HOST,
    caFile: env.MOVEIT_CA_FILE,
    tlsRejectUnauthorized: tlsRaw?.toLowerCase() !== 'false',
  };
}
