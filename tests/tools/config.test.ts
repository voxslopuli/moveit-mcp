import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitConfig } from '../../src/tools/config.js';

type StubClient = {
  getConfig: ReturnType<typeof vi.fn>;
  putConfig: ReturnType<typeof vi.fn>;
};

function makeStub(): StubClient {
  return {
    getConfig: vi.fn(),
    putConfig: vi.fn(),
  };
}

async function connect(stub: StubClient) {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerMoveitConfig(server, stub as unknown as MoveitClient);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

async function call(
  name: string,
  args: Record<string, unknown>,
  stub: StubClient,
) {
  const { client } = await connect(stub);
  return (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

async function listTools() {
  const { client } = await connect(makeStub());
  return (await client.listTools()).tools;
}

describe('moveit config tools', () => {
  it('moveit_get_config calls client.getConfig', async () => {
    const stub = makeStub();
    const fixture = { Tasks: [], Hosts: [] };
    stub.getConfig.mockResolvedValue(fixture);
    const result = await call('moveit_get_config', {}, stub);
    expect(stub.getConfig).toHaveBeenCalledWith();
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_put_config passes config object verbatim', async () => {
    const stub = makeStub();
    const fixture = { ok: true };
    const config = { Tasks: [{ taskId: '42' }], Hosts: [] };
    stub.putConfig.mockResolvedValue(fixture);
    const result = await call('moveit_put_config', { config }, stub);
    expect(stub.putConfig).toHaveBeenCalledWith(config);
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_put_config rejects an empty config object without calling the client', async () => {
    const stub = makeStub();
    const result = await call('moveit_put_config', { config: {} }, stub);
    expect(result.isError).toBe(true);
    expect(stub.putConfig).not.toHaveBeenCalled();
  });

  it('config tool descriptions flag the import as destructive', async () => {
    const tools = await listTools();
    const put = tools.find((t) => t.name === 'moveit_put_config');
    expect(put?.description).toContain('DESTRUCTIVE');
    expect(put?.description).toContain('IMPORT');
  });
});
