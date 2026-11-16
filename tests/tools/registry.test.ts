import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { registerMoveitMeta } from '../../src/tools/meta.js';
import { TOOL_GROUPS, ToolRegistry } from '../../src/tools/registry.js';

function makeRegister(names: string[]) {
  return (server: McpServer) => {
    for (const name of names) {
      server.registerTool(
        name,
        { description: `${name} description` },
        async () => ({ content: [{ type: 'text', text: name }] })
      );
    }
  };
}

async function setup(
  registerGroups: [keyof typeof TOOL_GROUPS, string[]][] = [
    ['info', ['moveit_get_info']],
    ['tasks', ['moveit_list_tasks']],
    ['config', ['moveit_get_config']],
  ]
) {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  const registry = new ToolRegistry(server);
  for (const [group, names] of registerGroups) {
    registry.registerGroup(group, makeRegister(names));
  }
  registerMoveitMeta(registry);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { server, registry, client };
}

async function listedToolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name).sort();
}

describe('ToolRegistry', () => {
  it('exposes TOOL_GROUPS with all six group names', () => {
    expect(Object.keys(TOOL_GROUPS).sort()).toEqual([
      'access',
      'config',
      'info',
      'reports',
      'resources',
      'tasks',
    ]);
  });

  it('enabled group tools are visible via listTools', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    const names = await listedToolNames(client);
    expect(names).toContain('moveit_list_tasks');
    expect(names).not.toContain('moveit_get_config');
    expect(registry.enabledGroups()).toEqual(['tasks']);
  });

  it('disabled group tools disappear from listTools', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    registry.enable('config');
    registry.disable('tasks');
    const names = await listedToolNames(client);
    expect(names).not.toContain('moveit_list_tasks');
    expect(names).toContain('moveit_get_config');
    expect(registry.enabledGroups()).toEqual(['config']);
  });

  it('disabling a never-enabled group is a no-op', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    expect(() => registry.disable('config')).not.toThrow();
    expect(registry.enabledGroups()).toEqual(['tasks']);
    expect(await listedToolNames(client)).toContain('moveit_list_tasks');
  });

  it('double-enable is a no-op (tools not duplicated)', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    registry.enable('tasks');
    const names = await listedToolNames(client);
    expect(names.filter((n) => n === 'moveit_list_tasks')).toHaveLength(1);
    expect(registry.enabledGroups()).toEqual(['tasks']);
  });

  it('disable then re-enable restores the same tools', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    registry.disable('tasks');
    registry.enable('tasks');
    const names = await listedToolNames(client);
    expect(names).toContain('moveit_list_tasks');
    expect(names.filter((n) => n === 'moveit_list_tasks')).toHaveLength(1);
  });

  it('the info group cannot be disabled', async () => {
    const { registry, client } = await setup();
    registry.enable('info');
    registry.enable('tasks');
    expect(() => registry.disable('info')).toThrow(/info/u);
    expect(registry.enabledGroups()).toEqual(['info', 'tasks']);
    expect(await listedToolNames(client)).toContain('moveit_get_info');
  });

  it('enabling a group with no tools works (access placeholder)', async () => {
    const { registry, client } = await setup([
      ['info', ['moveit_get_info']],
      ['access', []],
    ]);
    registry.enable('access');
    expect(registry.enabledGroups()).toEqual(['access']);
    expect(await listedToolNames(client)).toEqual([
      'moveit_tools_disable',
      'moveit_tools_enable',
      'moveit_tools_list',
    ]);
  });
});

describe('meta tools', () => {
  it('meta tools are always visible regardless of group state', async () => {
    const { registry, client } = await setup();
    const names = await listedToolNames(client);
    expect(names).toEqual([
      'moveit_tools_disable',
      'moveit_tools_enable',
      'moveit_tools_list',
    ]);
    registry.enable('tasks');
    expect(await listedToolNames(client)).toEqual(
      [
        'moveit_list_tasks',
        'moveit_tools_disable',
        'moveit_tools_enable',
        'moveit_tools_list',
      ].sort()
    );
  });

  it('moveit_tools_list reflects group state', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    const result = (await client.callTool({
      name: 'moveit_tools_list',
      arguments: {},
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as {
      groups: Array<{
        name: string;
        description: string;
        enabled: boolean;
        tools: string[];
      }>;
    };
    expect(parsed.groups.map((g) => g.name).sort()).toEqual([
      'access',
      'config',
      'info',
      'reports',
      'resources',
      'tasks',
    ]);
    const tasks = parsed.groups.find((g) => g.name === 'tasks');
    expect(tasks?.enabled).toBe(true);
    expect(tasks?.tools).toEqual(['moveit_list_tasks']);
    expect(parsed.groups.find((g) => g.name === 'config')?.enabled).toBe(false);
    expect(parsed.groups.find((g) => g.name === 'config')?.tools).toEqual([
      'moveit_get_config',
    ]);
  });

  it('moveit_tools_enable enables groups and reports added groups', async () => {
    const { registry, client } = await setup();
    const result = (await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['config', 'reports'] },
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as {
      enabled: string[];
      added: string[];
    };
    expect(parsed.enabled.sort()).toEqual(['config', 'reports']);
    expect(parsed.added.sort()).toEqual(['config', 'reports']);
    expect(registry.enabledGroups().sort()).toEqual(['config', 'reports']);
    const names = await listedToolNames(client);
    expect(names).toContain('moveit_get_config');
  });

  it('moveit_tools_enable is idempotent: already-enabled groups not in added', async () => {
    const { registry, client } = await setup();
    registry.enable('config');
    const result = (await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['config', 'reports'] },
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as {
      enabled: string[];
      added: string[];
    };
    expect(parsed.enabled.sort()).toEqual(['config', 'reports']);
    expect(parsed.added).toEqual(['reports']);
    expect(registry.enabledGroups().sort()).toEqual(['config', 'reports']);
  });

  it('moveit_tools_disable disables groups and reports removed groups', async () => {
    const { registry, client } = await setup();
    registry.enable('tasks');
    registry.enable('config');
    const result = (await client.callTool({
      name: 'moveit_tools_disable',
      arguments: { groups: ['tasks'] },
    })) as { content: Array<{ type: string; text: string }> };
    const parsed = JSON.parse(result.content[0].text) as {
      enabled: string[];
      removed: string[];
    };
    expect(parsed.enabled).toEqual(['config']);
    expect(parsed.removed).toEqual(['tasks']);
  });

  it('moveit_tools_disable rejects the info group with a clear error', async () => {
    const { client } = await setup();
    const result = (await client.callTool({
      name: 'moveit_tools_disable',
      arguments: { groups: ['info'] },
    })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('info');
  });

  it('rejects unknown group names', async () => {
    const { client } = await setup();
    const result = (await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['nope'] },
    })) as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});
