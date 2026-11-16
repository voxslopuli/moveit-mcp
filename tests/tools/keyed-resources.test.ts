import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitCustomScripts } from '../../src/tools/customscripts.js';
import { registerMoveitDateLists } from '../../src/tools/datelists.js';
import { registerMoveitPgpKeys } from '../../src/tools/pgpkeys.js';
import { registerMoveitSshKeys } from '../../src/tools/sshkeys.js';

type StubClient = {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

function makeStub(): StubClient {
  return { list: vi.fn(), get: vi.fn() };
}

async function connect(
  stub: StubClient,
  register: (server: McpServer, client: MoveitClient) => void,
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
  register: (server: McpServer, client: MoveitClient) => void,
) {
  const client = await connect(stub, register);
  return (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

describe('moveit custom script tools', () => {
  it('moveit_list_custom_scripts calls client.list with customscripts', async () => {
    const stub = makeStub();
    const fixture = { items: [{ name: 'Rotate Logs' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_custom_scripts',
      { page: 1, perPage: 25 },
      stub,
      registerMoveitCustomScripts,
    );
    expect(stub.list).toHaveBeenCalledWith('customscripts', {
      page: 1,
      perPage: 25,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_custom_script calls client.get with customscripts and customScriptId', async () => {
    const stub = makeStub();
    const fixture = { name: 'Rotate Logs' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_custom_script',
      { customScriptId: 'Rotate Logs' },
      stub,
      registerMoveitCustomScripts,
    );
    expect(stub.get).toHaveBeenCalledWith('customscripts', 'Rotate Logs');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_custom_script rejects empty customScriptId', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_custom_script',
      { customScriptId: '' },
      stub,
      registerMoveitCustomScripts,
    );
    expect(result.isError).toBe(true);
    expect(stub.get).not.toHaveBeenCalled();
  });
});

describe('moveit date list tools', () => {
  it('moveit_list_date_lists calls client.list with datelists', async () => {
    const stub = makeStub();
    const fixture = { items: [{ name: 'Holidays 2026' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_date_lists',
      { name: 'Holidays' },
      stub,
      registerMoveitDateLists,
    );
    expect(stub.list).toHaveBeenCalledWith('datelists', { name: 'Holidays' });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_date_list calls client.get with datelists and dateListId', async () => {
    const stub = makeStub();
    const fixture = { name: 'Holidays 2026' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_date_list',
      { dateListId: 'Holidays 2026' },
      stub,
      registerMoveitDateLists,
    );
    expect(stub.get).toHaveBeenCalledWith('datelists', 'Holidays 2026');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });
});

describe('moveit pgp key tools', () => {
  it('moveit_list_pgp_keys searches by uid, not name', async () => {
    const stub = makeStub();
    const fixture = { items: [{ uid: 'ops@example.com' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_pgp_keys',
      { uid: 'ops@example.com' },
      stub,
      registerMoveitPgpKeys,
    );
    const parsedArgs = stub.list.mock.calls[0][1] as Record<string, unknown>;
    expect(parsedArgs).toHaveProperty('uid', 'ops@example.com');
    expect(parsedArgs).not.toHaveProperty('name');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_pgp_key calls client.get with pgpkeys and pGPKeyId', async () => {
    const stub = makeStub();
    const fixture = { uid: 'ops@example.com' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_pgp_key',
      { pGPKeyId: 'ops@example.com' },
      stub,
      registerMoveitPgpKeys,
    );
    expect(stub.get).toHaveBeenCalledWith('pgpkeys', 'ops@example.com');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });
});

describe('moveit ssh key tools', () => {
  it('moveit_list_ssh_keys calls client.list with sshkeys', async () => {
    const stub = makeStub();
    const fixture = { items: [{ name: 'build-key' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_ssh_keys',
      { page: 3, perPage: 5 },
      stub,
      registerMoveitSshKeys,
    );
    expect(stub.list).toHaveBeenCalledWith('sshkeys', { page: 3, perPage: 5 });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_ssh_key calls client.get with sshkeys and sshKeyId', async () => {
    const stub = makeStub();
    const fixture = { name: 'build-key' };
    stub.get.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_ssh_key',
      { sshKeyId: 'build-key' },
      stub,
      registerMoveitSshKeys,
    );
    expect(stub.get).toHaveBeenCalledWith('sshkeys', 'build-key');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });
});
