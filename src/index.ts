import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import pkg from '../package.json' with { type: 'json' };
import { MoveitClient } from './client.js';
import { type Config, ConfigError, loadConfig } from './config.js';
import { TokenManager } from './token-manager.js';
import { registerMoveitCustomScripts } from './tools/customscripts.js';
import { registerMoveitDateLists } from './tools/datelists.js';
import { registerMoveitGlobalParameters } from './tools/globalparameters.js';
import { registerMoveitHosts } from './tools/hosts.js';
import { registerMoveitInfo } from './tools/info.js';
import { registerMoveitPgpKeys } from './tools/pgpkeys.js';
import { registerMoveitReports } from './tools/reports.js';
import { registerMoveitSshKeys } from './tools/sshkeys.js';
import { registerMoveitTaskGroups } from './tools/taskgroups.js';
import { registerMoveitTasks } from './tools/tasks.js';

export interface MoveitMcpServer {
  server: McpServer;
  client: MoveitClient;
  tokenManager: TokenManager;
  shutdown(): Promise<void>;
}

export function createServer(cfg: Config): MoveitMcpServer {
  const tokenManager = new TokenManager(cfg);
  const client = new MoveitClient(cfg, tokenManager);
  const server = new McpServer({
    name: 'moveit-mcp',
    version: pkg.version,
  });

  registerMoveitHosts(server, client);
  registerMoveitInfo(server, client);
  registerMoveitTaskGroups(server, client);
  registerMoveitGlobalParameters(server, client);
  registerMoveitCustomScripts(server, client);
  registerMoveitDateLists(server, client);
  registerMoveitPgpKeys(server, client);
  registerMoveitSshKeys(server, client);
  registerMoveitTasks(server, client);
  registerMoveitReports(server, client);

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
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}
