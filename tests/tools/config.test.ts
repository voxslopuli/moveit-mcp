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

describe('config v2 export/import tools', () => {
  type V2Stub = {
    exportConfigV2: ReturnType<typeof vi.fn>;
    importConfigV2: ReturnType<typeof vi.fn>;
  };

  function makeV2Stub(): V2Stub {
    return { exportConfigV2: vi.fn(), importConfigV2: vi.fn() };
  }

  async function callV2(
    name: string,
    args: Record<string, unknown>,
    stub: V2Stub,
  ) {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    registerMoveitConfig(server, stub as unknown as MoveitClient);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    return (await client.callTool({ name, arguments: args })) as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
  }

  async function v2Tools(stub: V2Stub) {
    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    registerMoveitConfig(server, stub as unknown as MoveitClient);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);
    return (await client.listTools()).tools;
  }

  it('moveit_export_config_v2 passes passphrase and sanitize', async () => {
    const stub = makeV2Stub();
    stub.exportConfigV2.mockResolvedValue({ configXML: '<config/>' });
    const result = await callV2(
      'moveit_export_config_v2',
      { passphrase: 'pw', sanitize: true },
      stub,
    );
    expect(stub.exportConfigV2).toHaveBeenCalledWith({
      passphrase: 'pw',
      sanitize: true,
    });
    expect(JSON.parse(result.content[0].text)).toEqual({
      configXML: '<config/>',
    });
  });

  it('moveit_export_config_v2 rejects empty options without calling the client', async () => {
    const stub = makeV2Stub();
    const result = await callV2('moveit_export_config_v2', {}, stub);
    expect(result.isError).toBe(true);
    expect(stub.exportConfigV2).not.toHaveBeenCalled();
  });

  it('moveit_export_config_v2 description contrasts portable and sanitized export', async () => {
    const tools = await v2Tools(makeV2Stub());
    const desc = tools.find(
      (t) => t.name === 'moveit_export_config_v2',
    )?.description;
    expect(desc).toContain('2019.1+');
    expect(desc).toContain('passphrase');
    expect(desc).toContain('moveit_get_config');
  });

  it('moveit_import_config_v2 passes configXML and passphrase', async () => {
    const stub = makeV2Stub();
    stub.importConfigV2.mockResolvedValue(null);
    const result = await callV2(
      'moveit_import_config_v2',
      { configXML: '<config/>', passphrase: 'pw' },
      stub,
    );
    expect(stub.importConfigV2).toHaveBeenCalledWith('<config/>', 'pw');
    expect(JSON.parse(result.content[0].text)).toEqual({
      imported: true,
    });
  });

  it('moveit_import_config_v2 rejects empty configXML and empty passphrase', async () => {
    const stub = makeV2Stub();
    const r1 = await callV2(
      'moveit_import_config_v2',
      { configXML: '', passphrase: 'pw' },
      stub,
    );
    expect(r1.isError).toBe(true);
    const r2 = await callV2(
      'moveit_import_config_v2',
      { configXML: '<config/>', passphrase: '' },
      stub,
    );
    expect(r2.isError).toBe(true);
    expect(stub.importConfigV2).not.toHaveBeenCalled();
  });

  it('moveit_import_config_v2 description marks destructive and pairs with export', async () => {
    const tools = await v2Tools(makeV2Stub());
    const desc = tools.find(
      (t) => t.name === 'moveit_import_config_v2',
    )?.description;
    expect(desc).toMatch(/DESTRUCTIVE/i);
    expect(desc).toContain('moveit_export_config_v2');
  });
});
