import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { jsonResult } from './util.js';

const NonEmptyRecord = z
  .record(z.string(), z.unknown())
  .refine((o) => Object.keys(o).length > 0, 'must be a non-empty object');

export function registerMoveitConfig(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_get_config',
    {
      description:
        'Export the MOVEit Automation configuration (admin-only; returns the full AdminConfigModel).',
      inputSchema: z.object({}),
    },
    async () => jsonResult(await client.getConfig()),
  );

  server.registerTool(
    'moveit_put_config',
    {
      description:
        'IMPORT (overwrite) the entire MOVEit Automation configuration with the given AdminConfigModel. DESTRUCTIVE: replaces all existing configuration. Get the current config first, modify, then import.',
      inputSchema: z.object({ config: NonEmptyRecord }),
    },
    async ({ config }) => jsonResult(await client.putConfig(config)),
  );
}
