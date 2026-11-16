import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { HostListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitHosts(
  server: McpServer,
  client: MoveitClient
): void {
  server.registerTool(
    'moveit_list_hosts',
    {
      description:
        'List MOVEit Transfer hosts, optionally filtered by host type (FileSystem, FTP, POP3, Share, siLock, SMTP, SSHFTP, AS1, AS2, AS3, S3) with pagination.',
      inputSchema: HostListParamsSchema,
    },
    async (args) => jsonResult(await client.list('hosts', args))
  );

  server.registerTool(
    'moveit_get_host',
    {
      description:
        'Get a single MOVEit Transfer host by its host ID (host name).',
      inputSchema: z.object({ hostId: z.string().min(1) }),
    },
    async ({ hostId }) => jsonResult(await client.get('hosts', hostId))
  );
}
