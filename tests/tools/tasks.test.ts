import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitTasks } from '../../src/tools/tasks.js';

type StubClient = {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  runningTasks: ReturnType<typeof vi.fn>;
  startTask: ReturnType<typeof vi.fn>;
  stopTask: ReturnType<typeof vi.fn>;
  setScheduler: ReturnType<typeof vi.fn>;
};

function makeStub(): StubClient {
  return {
    list: vi.fn(),
    get: vi.fn(),
    runningTasks: vi.fn(),
    startTask: vi.fn(),
    stopTask: vi.fn(),
    setScheduler: vi.fn(),
  };
}

async function connect(
  stub: StubClient,
): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerMoveitTasks(server, stub as unknown as MoveitClient);
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

describe('moveit task tools', () => {
  it('moveit_list_tasks calls client.list with tasks and parsed params', async () => {
    const stub = makeStub();
    const fixture = { items: [{ taskId: '42', name: 'Nightly Sync' }] };
    stub.list.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_tasks',
      { name: 'sync', page: 1, perPage: 25, fields: 'TaskID,Name' },
      stub,
    );
    expect(stub.list).toHaveBeenCalledWith('tasks', {
      name: 'sync',
      page: 1,
      perPage: 25,
      fields: 'TaskID,Name',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_task calls client.get with tasks and taskId', async () => {
    const stub = makeStub();
    const fixture = { taskId: '42', name: 'Nightly Sync' };
    stub.get.mockResolvedValue(fixture);
    const result = await call('moveit_get_task', { taskId: '42' }, stub);
    expect(stub.get).toHaveBeenCalledWith('tasks', '42');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_task rejects empty taskId without calling the client', async () => {
    const stub = makeStub();
    const result = await call('moveit_get_task', { taskId: '' }, stub);
    expect(result.isError).toBe(true);
    expect(stub.get).not.toHaveBeenCalled();
  });

  it('moveit_list_running_tasks calls client.runningTasks', async () => {
    const stub = makeStub();
    const fixture = [{ taskId: '42', active: true }];
    stub.runningTasks.mockResolvedValue(fixture);
    const result = await call('moveit_list_running_tasks', {}, stub);
    expect(stub.runningTasks).toHaveBeenCalledWith();
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_start_task passes parameters record', async () => {
    const stub = makeStub();
    const fixture = { runId: 'abc' };
    stub.startTask.mockResolvedValue(fixture);
    const result = await call(
      'moveit_start_task',
      { taskId: '42', parameters: { comment: 'go' } },
      stub,
    );
    expect(stub.startTask).toHaveBeenCalledWith('42', { comment: 'go' });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_start_task without parameters passes undefined', async () => {
    const stub = makeStub();
    stub.startTask.mockResolvedValue({ runId: 'abc' });
    await call('moveit_start_task', { taskId: '42' }, stub);
    expect(stub.startTask).toHaveBeenCalledWith('42', undefined);
  });

  it('moveit_stop_task calls client.stopTask with taskId', async () => {
    const stub = makeStub();
    const fixture = { ok: true };
    stub.stopTask.mockResolvedValue(fixture);
    const result = await call('moveit_stop_task', { taskId: '42' }, stub);
    expect(stub.stopTask).toHaveBeenCalledWith('42');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_set_scheduler calls client.setScheduler with action', async () => {
    const stub = makeStub();
    stub.setScheduler.mockResolvedValue(undefined);
    const result = await call('moveit_set_scheduler', { action: 'stop' }, stub);
    expect(stub.setScheduler).toHaveBeenCalledWith('stop');
    expect(result.isError).toBeUndefined();
  });

  it('mutating tools describe their mutating action', async () => {
    const tools = await listTools();
    expect(
      tools.find((t) => t.name === 'moveit_start_task')?.description,
    ).toMatch(/start/i);
    expect(
      tools.find((t) => t.name === 'moveit_stop_task')?.description,
    ).toMatch(/stop/i);
    expect(
      tools.find((t) => t.name === 'moveit_set_scheduler')?.description,
    ).toMatch(/scheduler/i);
    for (const name of [
      'moveit_start_task',
      'moveit_stop_task',
      'moveit_set_scheduler',
    ]) {
      expect(
        tools.find((t) => t.name === name)?.description?.length,
      ).toBeGreaterThan(0);
    }
  });
});
