import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { PgpListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitPgpKeys(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_pgp_keys',
    {
      description:
        'List OpenPGP keys known to MOVEit Automation, optionally filtered by key uid (user ID), with pagination.',
      inputSchema: PgpListParamsSchema,
    },
    async (args) => jsonResult(await client.list('pgpkeys', args)),
  );

  server.registerTool(
    'moveit_get_pgp_key',
    {
      description: 'Get a single OpenPGP key by its PGP key ID.',
      inputSchema: z.object({ pGPKeyId: z.string().min(1) }),
    },
    async ({ pGPKeyId }) => jsonResult(await client.get('pgpkeys', pGPKeyId)),
  );
}
