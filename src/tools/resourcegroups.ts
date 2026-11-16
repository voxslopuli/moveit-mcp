import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema, PagedListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

const AclSchema = z
  .record(z.string(), z.unknown())
  .refine((acl) => Object.keys(acl).length > 0, {
    message: 'acl must be a non-empty JSON object',
  });

export function registerMoveitResourceGroups(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_resource_groups',
    {
      description:
        'List MOVEit Automation resource groups, with optional name filter and pagination.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.listResourceGroups(args)),
  );

  server.registerTool(
    'moveit_get_resource_group',
    {
      description: 'Get a single MOVEit Automation resource group by its name.',
      inputSchema: z.object({ resourceGroupName: z.string().min(1) }),
    },
    async ({ resourceGroupName }) =>
      jsonResult(await client.getResourceGroup(resourceGroupName)),
  );
}

export function registerMoveitAcls(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_acls',
    {
      description:
        'List ACL entries controlling resource group access, with pagination.',
      inputSchema: PagedListParamsSchema,
    },
    async (args) => jsonResult(await client.listACLs(args)),
  );

  server.registerTool(
    'moveit_get_acl',
    {
      description: 'Get a single ACL entry by its ACL ID.',
      inputSchema: z.object({ aclId: z.string().min(1) }),
    },
    async ({ aclId }) => jsonResult(await client.getACL(aclId)),
  );

  server.registerTool(
    'moveit_add_acl',
    {
      description:
        'Create an ACL entry that grants a permission on a resource group. Mutating: adds access control state on the server.',
      inputSchema: z.object({ acl: AclSchema }),
    },
    async ({ acl }) => jsonResult(await client.addACL(acl)),
  );

  server.registerTool(
    'moveit_update_acl',
    {
      description:
        'Replace an existing ACL entry with the supplied JSON. Mutating: overwrites the ACL identified by aclId.',
      inputSchema: z.object({ aclId: z.string().min(1), acl: AclSchema }),
    },
    async ({ aclId, acl }) => jsonResult(await client.updateACL(aclId, acl)),
  );

  server.registerTool(
    'moveit_delete_acl',
    {
      description:
        'Delete an ACL entry by its ACL ID. DESTRUCTIVE: removes the permission with no undo.',
      inputSchema: z.object({ aclId: z.string().min(1) }),
    },
    async ({ aclId }) => jsonResult(await client.deleteACL(aclId)),
  );
}
