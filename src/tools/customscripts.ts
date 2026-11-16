import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitCustomScripts(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_custom_scripts',
    {
      description:
        'List custom scripts configured in MOVEit Automation, with pagination and optional name filter.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('customscripts', args))
  );

  server.registerTool(
    'moveit_get_custom_script',
    {
      description:
        'Get a single custom script by its custom script ID (script name).',
      inputSchema: z.object({ customScriptId: z.string().min(1) }),
    },
    async ({ customScriptId }) =>
      jsonResult(await client.get('customscripts', customScriptId))
  );
}
