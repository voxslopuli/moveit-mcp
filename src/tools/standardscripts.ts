import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitStandardScripts(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_standard_scripts',
    {
      description:
        'List standard (built-in) scripts shipped with MOVEit Automation, with optional name filter and pagination.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.listStandardScripts(args)),
  );

  server.registerTool(
    'moveit_get_standard_script',
    {
      description: 'Get a single standard script by its standard script ID.',
      inputSchema: z.object({ standardScriptId: z.string().min(1) }),
    },
    async ({ standardScriptId }) =>
      jsonResult(await client.getStandardScript(standardScriptId)),
  );
}
