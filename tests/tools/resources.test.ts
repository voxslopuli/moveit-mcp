import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitGlobalParameters } from '../../src/tools/globalparameters.js';
import { registerMoveitHosts } from '../../src/tools/hosts.js';
import { registerMoveitTaskGroups } from '../../src/tools/taskgroups.js';

interface StubClient {
  get: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

function makeStub(): StubClient {
  return { list: vi.fn(), get: vi.fn() };
}

async function connect(
  stub: StubClient,
  register: (server: McpServer, client: MoveitClient) => void
): Promise<Client> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  register(server, stub as unknown as MoveitClient);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function call(
  name: string,
  args: Record<string, unknown>,
  stub: StubClient,
  register: (server: McpServer, client: MoveitClient) => void
) {
  const client = await connect(stub, register);
  return (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

describe('moveit host tools', () => {
  it('moveit_list_hosts calls client.list with hosts and parsed params', async () => {
    const stub = makeStub();
    const fixture = { items: [{ name: 'AWS S3', type: 'S3' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_hosts',
      { page: 1, perPage: 25, type: 'S3' },
      stub,
      registerMoveitHosts
    );
    expect(stub.list).toHaveBeenCalledWith('hosts', {
      page: 1,
      perPage: 25,
      type: 'S3',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_host calls client.get with hosts and hostId', async () => {
    const stub = makeStub();
    const fixture = { name: 'AWS S3', type: 'S3' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_host',
      { hostId: 'AWS S3' },
      stub,
      registerMoveitHosts
    );
    expect(stub.get).toHaveBeenCalledWith('hosts', 'AWS S3');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_host rejects empty hostId', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_host',
      { hostId: '' },
      stub,
      registerMoveitHosts
    );
    expect(result.isError).toBe(true);
    expect(stub.get).not.toHaveBeenCalled();
  });
});

describe('moveit task group tools', () => {
  it('moveit_list_task_groups calls client.list with taskgroups and params', async () => {
    const stub = makeStub();
    const fixture = { items: [{ name: 'Group A' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_task_groups',
      { page: 2, perPage: 10 },
      stub,
      registerMoveitTaskGroups
    );
    expect(stub.list).toHaveBeenCalledWith('taskgroups', {
      page: 2,
      perPage: 10,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_task_group calls client.get with taskgroups and taskGroupName', async () => {
    const stub = makeStub();
    const fixture = { name: 'Group A' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_task_group',
      { taskGroupName: 'Group A' },
      stub,
      registerMoveitTaskGroups
    );
    expect(stub.get).toHaveBeenCalledWith('taskgroups', 'Group A');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });
});

describe('moveit global parameter tools', () => {
  it('moveit_list_global_parameters calls client.list with globalparameters', async () => {
    const stub = makeStub();
    const fixture = { items: [{ Name: 'AdminTimeout' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_global_parameters',
      {},
      stub,
      registerMoveitGlobalParameters
    );
    expect(stub.list).toHaveBeenCalledWith('globalparameters', {});
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_global_parameter calls client.get with globalparameters and name', async () => {
    const stub = makeStub();
    const fixture = { Name: 'AdminTimeout', Value: '3600' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_global_parameter',
      { name: 'AdminTimeout' },
      stub,
      registerMoveitGlobalParameters
    );
    expect(stub.get).toHaveBeenCalledWith('globalparameters', 'AdminTimeout');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });
});

describe('tool error handling', () => {
  it('returns isError result when client throws', async () => {
    const stub = makeStub();
    stub.list.mockRejectedValue(new Error('HTTP 401: unauthorized'));
    const result = await call(
      'moveit_list_hosts',
      {},
      stub,
      registerMoveitHosts
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('HTTP 401: unauthorized');
  });
});
