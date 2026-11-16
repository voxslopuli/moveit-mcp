import type { McpServer } from '@modelcontextprotocol/server';
import type { MoveitClient } from '../client.js';
import { jsonResult } from './util.js';

export function registerMoveitInfo(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_get_info',
    {
      description:
        'Get MOVEit Automation server information, including the product version.',
    },
    async () => jsonResult(await client.info()),
  );
}
