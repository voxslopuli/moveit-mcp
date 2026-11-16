import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitInfo } from '../../src/tools/info.js';

type StubClient = {
  info: ReturnType<typeof vi.fn>;
};

async function call(): Promise<{
  content: Array<{ type: string; text: string }>;
}> {
  const stub = { info: vi.fn() } as unknown as StubClient;
  const fixture = { version: '2019.1.0', server: 'MOVEit Automation' };
  (stub.info as ReturnType<typeof vi.fn>).mockResolvedValue(fixture);
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerMoveitInfo(server, stub as unknown as MoveitClient);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  const result = (await client.callTool({ name: 'moveit_get_info' })) as {
    content: Array<{ type: string; text: string }>;
  };
  expect(stub.info).toHaveBeenCalledWith();
  return result;
}

describe('moveit info tool', () => {
  it('moveit_get_info takes no input and returns client.info()', async () => {
    const result = await call();
    expect(JSON.parse(result.content[0].text)).toEqual({
      version: '2019.1.0',
      server: 'MOVEit Automation',
    });
  });
});
