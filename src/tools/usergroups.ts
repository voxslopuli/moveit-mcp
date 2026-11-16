import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitUserGroups(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_user_groups',
    {
      description:
        'List MOVEit Automation user groups, with optional name filter and pagination.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.listUserGroups(args)),
  );

  server.registerTool(
    'moveit_get_user_group',
    {
      description: 'Get a single MOVEit Automation user group by its name.',
      inputSchema: z.object({ userGroupName: z.string().min(1) }),
    },
    async ({ userGroupName }) =>
      jsonResult(await client.getUserGroup(userGroupName)),
  );
}
