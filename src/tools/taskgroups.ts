import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitTaskGroups(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_task_groups',
    {
      description:
        'List MOVEit Transfer task groups with optional pagination and name filtering. (deprecated since 2019.1 — prefer resource groups)',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('taskgroups', args))
  );

  server.registerTool(
    'moveit_get_task_group',
    {
      description:
        'Get a single MOVEit Transfer task group by its name. (deprecated since 2019.1 — prefer resource groups)',
      inputSchema: z.object({ taskGroupName: z.string().min(1) }),
    },
    async ({ taskGroupName }) =>
      jsonResult(await client.get('taskgroups', taskGroupName))
  );
}
