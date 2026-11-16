import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitTaskCrud } from '../../src/tools/taskcrud.js';

interface StubClient {
  createTask: ReturnType<typeof vi.fn>;
  deleteTask: ReturnType<typeof vi.fn>;
  updateTask: ReturnType<typeof vi.fn>;
}

function makeStub(): StubClient {
  return {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  };
}

async function connect(stub: StubClient) {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerMoveitTaskCrud(server, stub as unknown as MoveitClient);
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
  stub: StubClient
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

describe('moveit task crud tools', () => {
  it('moveit_create_task passes task verbatim', async () => {
    const stub = makeStub();
    const fixture = { taskId: '99', name: 'New Task' };
    const task = { name: 'New Task', Source: {} };
    stub.createTask.mockResolvedValue(fixture);
    const result = await call('moveit_create_task', { task }, stub);
    expect(stub.createTask).toHaveBeenCalledWith(task);
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_create_task rejects an empty task object without calling the client', async () => {
    const stub = makeStub();
    const result = await call('moveit_create_task', { task: {} }, stub);
    expect(result.isError).toBe(true);
    expect(stub.createTask).not.toHaveBeenCalled();
  });

  it('moveit_update_task routes taskId and passes task verbatim', async () => {
    const stub = makeStub();
    const fixture = { taskId: '42', name: 'Updated' };
    const task = { taskId: '42', name: 'Updated' };
    stub.updateTask.mockResolvedValue(fixture);
    const result = await call(
      'moveit_update_task',
      { taskId: '42', task },
      stub
    );
    expect(stub.updateTask).toHaveBeenCalledWith('42', task);
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_update_task rejects empty taskId and empty task', async () => {
    const stub = makeStub();
    const emptyId = await call(
      'moveit_update_task',
      { taskId: '', task: { name: 'x' } },
      stub
    );
    const emptyTask = await call(
      'moveit_update_task',
      { taskId: '42', task: {} },
      stub
    );
    expect(emptyId.isError).toBe(true);
    expect(emptyTask.isError).toBe(true);
    expect(stub.updateTask).not.toHaveBeenCalled();
  });

  it('moveit_delete_task routes taskId and returns deleted', async () => {
    const stub = makeStub();
    stub.deleteTask.mockResolvedValue(undefined);
    const result = await call('moveit_delete_task', { taskId: '42' }, stub);
    expect(stub.deleteTask).toHaveBeenCalledWith('42');
    expect(JSON.parse(result.content[0].text)).toEqual({ deleted: '42' });
  });

  it('moveit_delete_task rejects empty taskId without calling the client', async () => {
    const stub = makeStub();
    const result = await call('moveit_delete_task', { taskId: '' }, stub);
    expect(result.isError).toBe(true);
    expect(stub.deleteTask).not.toHaveBeenCalled();
  });

  it('task crud descriptions state destructive/replace wording', async () => {
    const tools = await listTools();
    const del = tools.find((t) => t.name === 'moveit_delete_task');
    const upd = tools.find((t) => t.name === 'moveit_update_task');
    expect(del?.description).toContain('Delete');
    expect(del?.description).toContain('destructive');
    expect(upd?.description).toContain('Replace');
  });
});
