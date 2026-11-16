import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Config, ConfigError } from '../src/config.js';
import { createServer, main, runMain } from '../src/index.js';

const validConfig: Config = {
  baseUrl: 'https://moveit.example.com',
  username: 'svc',
  password: 'secret',
  tlsRejectUnauthorized: true,
};

// Default-enabled groups (info, tasks, reports) plus the always-available
// meta tools. config/resources groups register but stay disabled by default.
const EXPECTED_TOOLS = [
  'moveit_get_info',
  'moveit_list_tasks',
  'moveit_get_task',
  'moveit_list_running_tasks',
  'moveit_start_task',
  'moveit_stop_task',
  'moveit_set_scheduler',
  'moveit_create_task',
  'moveit_update_task',
  'moveit_delete_task',
  'moveit_audit_report',
  'moveit_file_activity_report',
  'moveit_task_runs_report',
  'moveit_tools_list',
  'moveit_tools_enable',
  'moveit_tools_disable',
];

describe('createServer', () => {
  it('exposes exactly the default-enabled moveit_ tools', async () => {
    const srv = createServer(validConfig);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      srv.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names.length).toBe(EXPECTED_TOOLS.length);
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    expect(names.every((n) => /^moveit_/.test(n))).toBe(true);
  });

  it('shutdown() calls client.shutdown() once; second call is a no-op', async () => {
    const srv = createServer(validConfig);
    const spy = vi.spyOn(srv.client, 'shutdown');
    await srv.shutdown();
    await srv.shutdown();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('runMain', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch must not be called before transport');
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws ConfigError naming missing vars before any fetch', async () => {
    await expect(runMain({ MOVEIT_BASE_URL: 'https://x' })).rejects.toThrow(
      ConfigError,
    );
    await expect(runMain({})).rejects.toThrow(
      /MOVEIT_BASE_URL, MOVEIT_USERNAME, MOVEIT_PASSWORD/,
    );
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('main', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with code 1 on ConfigError', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code: number,
    ) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(main()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing required environment variables'),
    );
  });
});
