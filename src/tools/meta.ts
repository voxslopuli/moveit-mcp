import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import {
  TOOL_GROUP_NAMES,
  TOOL_GROUPS,
  type ToolGroup,
  type ToolRegistry,
} from './registry.js';
import { jsonResult } from './util.js';

const GroupsInput = z.object({
  groups: z
    .array(z.enum(TOOL_GROUP_NAMES as [ToolGroup, ...ToolGroup[]]))
    .min(1),
});

/**
 * Registers the always-available meta tools that let clients discover and
 * change which tool groups are enabled at runtime.
 */
export function registerMoveitMeta(registry: ToolRegistry): void {
  const server: McpServer = registry.server;

  server.registerTool(
    'moveit_tools_list',
    {
      description:
        'List moveit-mcp tool groups with their description, enabled flag, and tool names.',
      inputSchema: z.object({}),
    },
    () => {
      const enabled = new Set(registry.enabledGroups());
      return jsonResult({
        groups: TOOL_GROUP_NAMES.map((name) => ({
          name,
          description: TOOL_GROUPS[name],
          enabled: enabled.has(name),
          tools: registry.toolNames(name),
        })),
      });
    }
  );

  server.registerTool(
    'moveit_tools_enable',
    {
      description:
        'Enable one or more moveit-mcp tool groups, making their tools visible to the client.',
      inputSchema: GroupsInput,
    },
    ({ groups }) => {
      const before = new Set(registry.enabledGroups());
      for (const group of groups) {
        registry.enable(group);
      }
      return jsonResult({
        enabled: registry.enabledGroups(),
        added: groups.filter((group) => !before.has(group)),
      });
    }
  );

  server.registerTool(
    'moveit_tools_disable',
    {
      description:
        'Disable one or more moveit-mcp tool groups, hiding their tools from the client. The info group cannot be disabled.',
      inputSchema: GroupsInput,
    },
    ({ groups }) => {
      if (groups.includes('info')) {
        throw new Error(
          "The 'info' tool group cannot be disabled: it is always available."
        );
      }
      const before = new Set(registry.enabledGroups());
      for (const group of groups) {
        registry.disable(group);
      }
      return jsonResult({
        enabled: registry.enabledGroups(),
        removed: groups.filter((group) => before.has(group)),
      });
    }
  );
}
