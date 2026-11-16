import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitGlobalParameters(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_global_parameters',
    {
      description:
        'List MOVEit Transfer global system parameters (server settings) with optional pagination.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('globalparameters', args)),
  );

  server.registerTool(
    'moveit_get_global_parameter',
    {
      description:
        'Get a single MOVEit Transfer global parameter by its exact name.',
      inputSchema: z.object({ name: z.string().min(1) }),
    },
    async ({ name }) => jsonResult(await client.get('globalparameters', name)),
  );
}
