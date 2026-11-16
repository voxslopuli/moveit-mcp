import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitDateLists(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_date_lists',
    {
      description:
        'List date lists (named collections of dates usable in MOVEit Automation schedule conditions), with pagination and optional name filter.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('datelists', args))
  );

  server.registerTool(
    'moveit_get_date_list',
    {
      description: 'Get a single date list by its date list ID (list name).',
      inputSchema: z.object({ dateListId: z.string().min(1) }),
    },
    async ({ dateListId }) =>
      jsonResult(await client.get('datelists', dateListId))
  );
}
