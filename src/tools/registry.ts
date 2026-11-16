import type { McpServer, RegisteredTool } from '@modelcontextprotocol/server';

/**
 * Tool groups exposed by moveit-mcp. Clients only see tools from enabled
 * groups, which keeps the advertised tool surface small enough for tool
 * selection to work well.
 */
export const TOOL_GROUPS = {
  info: 'MOVEit Automation server info (always available).',
  tasks: 'Task listing, retrieval, and lifecycle (start/stop/scheduler).',
  reports: 'Audit, file activity, and task run reports.',
  config: 'System configuration get/put.',
  resources:
    'Hosts, task groups, resource groups, ACL reads, global parameters, custom scripts, date lists, PGP keys, SSH keys, SSL certs, and standard scripts.',
  access:
    'User groups and resource group ACL management (add/update/delete ACLs).',
} as const;

export type ToolGroup = keyof typeof TOOL_GROUPS;

export const TOOL_GROUP_NAMES = Object.keys(TOOL_GROUPS) as ToolGroup[];

type RegisterFn = (server: McpServer) => void;

/**
 * Groups tool registration so whole groups of tools can be enabled and
 * disabled at runtime.
 *
 * `registerGroup` runs the group's register function once, immediately, and
 * disables the resulting tools — so tool names are known for listing while
 * the group stays hidden until `enable()`. The `RegisteredTool` handles are
 * kept so `disable()`/`enable()` toggle exactly those tools (the SDK sends a
 * tool-list-changed notification for each toggle).
 */
export class ToolRegistry {
  readonly server: McpServer;

  readonly #handles = new Map<ToolGroup, RegisteredTool[]>();
  readonly #names = new Map<ToolGroup, string[]>();
  readonly #active = new Set<ToolGroup>();

  constructor(server: McpServer) {
    this.server = server;
  }

  registerGroup(group: ToolGroup, register: RegisterFn): void {
    const handles: RegisteredTool[] = [];
    const names: string[] = [];
    const capture = new Proxy(this.server, {
      get: (target, prop) => {
        if (prop === 'registerTool') {
          return (
            name: string,
            config: Parameters<McpServer['registerTool']>[1],
            cb: Parameters<McpServer['registerTool']>[2],
          ) => {
            const handle = target.registerTool(name, config, cb);
            handle.disable();
            handles.push(handle);
            names.push(name);
            return handle;
          };
        }
        return Reflect.get(target, prop);
      },
    });
    register(capture as McpServer);
    this.#handles.set(group, handles);
    this.#names.set(group, names);
  }

  enable(group: ToolGroup): void {
    if (this.#active.has(group)) return;
    for (const handle of this.#handles.get(group) ?? []) handle.enable();
    this.#active.add(group);
  }

  disable(group: ToolGroup): void {
    if (group === 'info') {
      throw new Error(
        `The '${group}' tool group cannot be disabled: it is always available.`,
      );
    }
    if (!this.#active.has(group)) return;
    for (const handle of this.#handles.get(group) ?? []) handle.disable();
    this.#active.delete(group);
  }

  enabledGroups(): ToolGroup[] {
    return TOOL_GROUP_NAMES.filter((group) => this.#active.has(group));
  }

  toolNames(group: ToolGroup): string[] {
    return this.#names.get(group) ?? [];
  }
}
