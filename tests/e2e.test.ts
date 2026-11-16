import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeMoveit, startFakeMoveit } from './fake-moveit.js';

describe('stdio e2e smoke', () => {
  let fake: FakeMoveit;
  let client: Client;
  let transport: StdioClientTransport;

  afterEach(async () => {
    await client?.close();
    await fake?.close();
    if (transport) {
      const pid = transport.pid;
      if (pid) process.kill(pid, 'SIGTERM');
    }
  });

  it('lists 24 tools and serves info/tasks through the fake MOVEit API', async () => {
    fake = await startFakeMoveit();
    const childEnv: Record<string, string> = {
      MOVEIT_BASE_URL: `http://127.0.0.1:${fake.port}/webadmin`,
      MOVEIT_USERNAME: 'u',
      MOVEIT_PASSWORD: 'p',
    };
    for (const key of ['PATH', 'HOME'] as const) {
      const v = process.env[key];
      if (v) childEnv[key] = v;
    }
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/index.ts'],
      env: childEnv,
    });
    client = new Client({ name: 'e2e-client', version: '0.0.0' });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.length).toBe(24);

    const info = await client.callTool({ name: 'moveit_get_info' });
    const infoText = (info.content as Array<{ type: string; text: string }>)[0]
      .text;
    expect(JSON.parse(infoText)).toEqual({
      version: '2019.1.0',
      server: 'MOVEit Automation',
    });

    const tasks = await client.callTool({ name: 'moveit_list_tasks' });
    const tasksText = (
      tasks.content as Array<{ type: string; text: string }>
    )[0].text;
    const parsed = JSON.parse(tasksText) as {
      items: Array<{ ID: string; Name: string; Active: number }>;
    };
    expect(parsed.items).toEqual([
      { ID: '226676691', Name: '!TaylorImportTest', Active: 0 },
    ]);

    expect(fake.seenBearer()).toBe(true);
  });
});
