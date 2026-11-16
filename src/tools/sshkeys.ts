import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitSshKeys(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_ssh_keys',
    {
      description:
        'List SSH client keys known to MOVEit Automation, with pagination and optional name filter.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('sshkeys', args))
  );

  server.registerTool(
    'moveit_get_ssh_key',
    {
      description: 'Get a single SSH key by its SSH key ID (key name).',
      inputSchema: z.object({ sshKeyId: z.string().min(1) }),
    },
    async ({ sshKeyId }) => jsonResult(await client.get('sshkeys', sshKeyId))
  );
}
