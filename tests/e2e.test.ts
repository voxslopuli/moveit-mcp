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

  it('lists default tools and serves info/tasks through the fake MOVEit API', async () => {
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
    expect(tools.tools.length).toBe(16);

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

    const created = await client.callTool({
      name: 'moveit_create_task',
      arguments: { task: { Name: 'new-task', Active: 0 } },
    });
    const createdText = (
      created.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(createdText)).toEqual({
      Name: 'new-task',
      Active: 0,
    });

    const updated = await client.callTool({
      name: 'moveit_update_task',
      arguments: {
        taskId: '226676691',
        task: { ID: '226676691', Name: 'renamed', Active: 1 },
      },
    });
    const updatedText = (
      updated.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(updatedText)).toEqual({
      ID: '226676691',
      Name: 'renamed',
      Active: 1,
    });

    const deleted = await client.callTool({
      name: 'moveit_delete_task',
      arguments: { taskId: '226676691' },
    });
    const deletedText = (
      deleted.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(deletedText)).toEqual({ deleted: '226676691' });

    // config tools are disabled by default; enable the group via meta tool
    const enableResult = await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['config'] },
    });
    const enableText = (
      enableResult.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(enableText)).toEqual({
      enabled: ['info', 'tasks', 'reports', 'config'],
      added: ['config'],
    });

    const config = await client.callTool({ name: 'moveit_get_config' });
    const configText = (
      config.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(configText)).toEqual({
      Settings: { adminEmail: 'admin@example.com' },
    });

    expect(fake.seenBearer()).toBe(true);
  });
});
