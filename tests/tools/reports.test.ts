import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import { registerMoveitReports } from '../../src/tools/reports.js';

type StubClient = {
  report: ReturnType<typeof vi.fn>;
};

function makeStub(): StubClient {
  return { report: vi.fn() };
}

async function connect(
  stub: StubClient,
): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  registerMoveitReports(server, stub as unknown as MoveitClient);
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

const FIXTURE = {
  reports: { report: [{ Status: 'Failure', LogTime: '2026-01-01T00:00:00Z' }] },
};

describe('moveit report tools', () => {
  it('moveit_audit_report routes to audit kind with parsed query', async () => {
    const stub = makeStub();
    stub.report.mockResolvedValue(FIXTURE);
    const q = {
      predicate: 'Status=="Failure"',
      orderBy: '!LogTime',
      maxCount: 100,
    };
    const result = await call('moveit_audit_report', q, stub);
    expect(stub.report).toHaveBeenCalledWith('audit', q);
    expect(JSON.parse(result.content[0].text)).toEqual(FIXTURE);
  });

  it('moveit_file_activity_report routes to fileactivity kind', async () => {
    const stub = makeStub();
    stub.report.mockResolvedValue(FIXTURE);
    const q = {
      predicate: 'StatusCode=out=("5000","5010")',
      orderBy: '!LogStamp',
    };
    const result = await call('moveit_file_activity_report', q, stub);
    expect(stub.report).toHaveBeenCalledWith('fileactivity', q);
    expect(JSON.parse(result.content[0].text)).toEqual(FIXTURE);
  });

  it('moveit_task_runs_report routes to taskruns kind', async () => {
    const stub = makeStub();
    stub.report.mockResolvedValue(FIXTURE);
    const result = await call(
      'moveit_task_runs_report',
      { predicate: 'Status=in=("Success","Failure")', orderBy: '!StartTime' },
      stub,
    );
    expect(stub.report).toHaveBeenCalledWith('taskruns', {
      predicate: 'Status=in=("Success","Failure")',
      orderBy: '!StartTime',
    });
    expect(JSON.parse(result.content[0].text)).toEqual(FIXTURE);
  });

  it('predicate with embedded double quotes round-trips byte-identical', async () => {
    const stub = makeStub();
    stub.report.mockResolvedValue(FIXTURE);
    const predicate = 'Status=in=("Success","Failure")';
    await call(
      'moveit_task_runs_report',
      { predicate, orderBy: '!StartTime' },
      stub,
    );
    expect(stub.report.mock.calls[0][1].predicate).toBe(predicate);
  });

  it('tool descriptions include the documented UI-equivalent recipes', async () => {
    const tools = await listTools();
    const desc = (name: string) =>
      tools.find((t) => t.name === name)?.description ?? '';
    expect(desc('moveit_audit_report')).toContain('Status=="Failure"');
    expect(desc('moveit_audit_report')).toContain('!LogTime');
    expect(desc('moveit_file_activity_report')).toContain(
      'StatusCode=out=("5000","5010")',
    );
    expect(desc('moveit_file_activity_report')).toContain('!LogStamp');
    expect(desc('moveit_task_runs_report')).toContain(
      'Status=in=("Success","Failure")',
    );
    expect(desc('moveit_task_runs_report')).toContain('!StartTime');
  });

  it('rejects empty predicate without calling the client', async () => {
    const stub = makeStub();
    const result = await call('moveit_audit_report', { predicate: '' }, stub);
    expect(result.isError).toBe(true);
    expect(stub.report).not.toHaveBeenCalled();
  });
});
