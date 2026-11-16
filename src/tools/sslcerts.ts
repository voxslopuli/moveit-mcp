import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { PagedListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitSslCerts(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_ssl_certificates',
    {
      description:
        'List SSL certificates trusted by MOVEit Automation, with pagination.',
      inputSchema: PagedListParamsSchema,
    },
    async (args) => jsonResult(await client.listSSLCerts(args))
  );

  server.registerTool(
    'moveit_get_ssl_certificate',
    {
      description:
        'Get a single SSL certificate by its SHA-1 certificate thumbprint.',
      inputSchema: z.object({ thumbprint: z.string().min(1) }),
    },
    async ({ thumbprint }) => jsonResult(await client.getSSLCert(thumbprint))
  );
}
