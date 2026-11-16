import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { Agent } from 'undici';
import pkg from '../package.json' with { type: 'json' };
import { MoveitClient } from './client.js';
import { type Config, ConfigError, loadConfig } from './config.js';
import { TokenManager } from './token-manager.js';
import { registerMoveitConfig } from './tools/config.js';
import { registerMoveitCustomScripts } from './tools/customscripts.js';
import { registerMoveitDateLists } from './tools/datelists.js';
import { registerMoveitGlobalParameters } from './tools/globalparameters.js';
import { registerMoveitHosts } from './tools/hosts.js';
import { registerMoveitInfo } from './tools/info.js';
import { registerMoveitMeta } from './tools/meta.js';
import { registerMoveitPgpKeys } from './tools/pgpkeys.js';
import { type ToolGroup, ToolRegistry } from './tools/registry.js';
import { registerMoveitReports } from './tools/reports.js';
import {
  registerMoveitAcls,
  registerMoveitResourceGroups,
} from './tools/resourcegroups.js';
import { registerMoveitSshKeys } from './tools/sshkeys.js';
import { registerMoveitSslCerts } from './tools/sslcerts.js';
import { registerMoveitStandardScripts } from './tools/standardscripts.js';
import { registerMoveitTaskCrud } from './tools/taskcrud.js';
import { registerMoveitTaskGroups } from './tools/taskgroups.js';
import { registerMoveitTasks } from './tools/tasks.js';
import { registerMoveitUserGroups } from './tools/usergroups.js';

export interface MoveitMcpServer {
  server: McpServer;
  client: MoveitClient;
  tokenManager: TokenManager;
  shutdown(): Promise<void>;
}

export interface ServerOptions {
  /** Test injection: overrides the undici dispatcher built from cfg.caFile. */
  dispatcher?: unknown;
  /** Test injection: overrides global fetch. */
  fetchImpl?: typeof fetch;
}

export function createServer(
  cfg: Config,
  opts?: ServerOptions,
): MoveitMcpServer {
  let dispatcher = opts?.dispatcher;
  if (dispatcher === undefined && cfg.caFile !== undefined) {
    let ca: string;
    try {
      ca = readFileSync(cfg.caFile, 'utf8');
    } catch {
      throw new ConfigError(
        `MOVEIT_CA_FILE: cannot read CA bundle file at ${cfg.caFile}`,
      );
    }
    dispatcher = new Agent({ connect: { ca } });
  }
  const tokenManager = new TokenManager(cfg, opts?.fetchImpl, { dispatcher });
  const client = new MoveitClient(cfg, tokenManager, {
    fetchImpl: opts?.fetchImpl,
    dispatcher,
  });
  const server = new McpServer({
    name: 'moveit-mcp',
    version: pkg.version,
  });

  const registry = new ToolRegistry(server);

  const registerAll =
    (
      ...registerFns: Array<(server: McpServer, client: MoveitClient) => void>
    ) =>
    (registryServer: McpServer) => {
      for (const register of registerFns) register(registryServer, client);
    };

  const groups: Array<[ToolGroup, (server: McpServer) => void]> = [
    ['info', registerAll(registerMoveitInfo)],
    ['tasks', registerAll(registerMoveitTasks, registerMoveitTaskCrud)],
    ['reports', registerAll(registerMoveitReports)],
    ['config', registerAll(registerMoveitConfig)],
    [
      'resources',
      registerAll(
        registerMoveitHosts,
        registerMoveitTaskGroups,
        registerMoveitGlobalParameters,
        registerMoveitCustomScripts,
        registerMoveitDateLists,
        registerMoveitPgpKeys,
        registerMoveitSshKeys,
        registerMoveitSslCerts,
        registerMoveitStandardScripts,
        registerMoveitResourceGroups,
      ),
    ],
    ['access', registerAll(registerMoveitUserGroups, registerMoveitAcls)],
  ];
  for (const [group, register] of groups) {
    registry.registerGroup(group, register);
  }

  registerMoveitMeta(registry);

  for (const group of ['info', 'tasks', 'reports'] as const) {
    registry.enable(group);
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await client.shutdown();
  };

  return { server, client, tokenManager, shutdown };
}

export async function runMain(
  env: Record<string, string | undefined>,
): Promise<void> {
  const cfg = loadConfig(env);
  const { server, shutdown } = createServer(cfg);

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.connect(new StdioServerTransport());
}

export async function main(): Promise<void> {
  try {
    await runMain(process.env as Record<string, string | undefined>);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`moveit-mcp: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url
) {
  void main();
}
