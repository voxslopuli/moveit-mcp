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
  server.registerTool(
    'moveit_export_config_v2',
    {
      description:
        'Export the MOVEit Automation configuration as XML using the config v2 API (2019.1+). Two modes: encrypted-with-passphrase (portable — secrets are encrypted with the given passphrase and can be imported elsewhere) or sanitized (secrets removed). Provide passphrase or sanitize: true. moveit_get_config is the deprecated server-key export.',
      inputSchema: z
        .object({
          passphrase: z.string().min(1).optional(),
          sanitize: z.boolean().optional(),
        })
        .refine((x) => !!(x.passphrase ?? x.sanitize), {
          message: 'provide passphrase or sanitize',
        }),
    },
    async ({ passphrase, sanitize }) =>
      jsonResult(await client.exportConfigV2({ passphrase, sanitize })),
  );

  server.registerTool(
    'moveit_import_config_v2',
    {
      description:
        'DESTRUCTIVE: import a full MOVEit Automation configuration XML, replacing all existing configuration. Pair with moveit_export_config_v2 using a passphrase so encrypted secrets survive the round-trip. Requires MOVEit Automation 2019.1+.',
      inputSchema: z.object({
        configXML: z.string().min(1),
        passphrase: z.string().min(1),
      }),
    },
    async ({ configXML, passphrase }) => {
      await client.importConfigV2(configXML, passphrase);
      return jsonResult({ imported: true });
    },
  );
}
