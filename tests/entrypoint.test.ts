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
// 21 visible: info 1 + tasks 13 + reports 4 + meta 3.
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
  'moveit_list_task_logs',
  'moveit_get_task_log',
  'moveit_kill_task',
  'moveit_get_scheduler_status',
  'moveit_audit_report',
  'moveit_file_activity_report',
  'moveit_task_runs_report',
  'moveit_export_report',
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
    expect(names.every((n) => /^moveit_/u.test(n))).toBe(true);
  });

  it('registers 49 group tools (resources 20, access 7) plus 3 meta tools', async () => {
    const srv = createServer(validConfig);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await Promise.all([
      srv.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const result = (await client.callTool({
      name: 'moveit_tools_list',
      arguments: {},
    })) as {
      content: Array<{ type: string; text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text) as {
      groups: Array<{
        name: string;
        enabled: boolean;
        tools: string[];
      }>;
    };
    const byName = Object.fromEntries(parsed.groups.map((g) => [g.name, g]));
    expect(byName.resources.tools).toHaveLength(20);
    expect([...byName.resources.tools].sort().join(',')).toBe(
      [
        'moveit_list_hosts',
        'moveit_get_host',
        'moveit_list_task_groups',
        'moveit_get_task_group',
        'moveit_list_global_parameters',
        'moveit_get_global_parameter',
        'moveit_list_custom_scripts',
        'moveit_get_custom_script',
        'moveit_list_date_lists',
        'moveit_get_date_list',
        'moveit_list_pgp_keys',
        'moveit_get_pgp_key',
        'moveit_list_ssh_keys',
        'moveit_get_ssh_key',
        'moveit_list_ssl_certificates',
        'moveit_get_ssl_certificate',
        'moveit_list_standard_scripts',
        'moveit_get_standard_script',
        'moveit_list_resource_groups',
        'moveit_get_resource_group',
      ]
        .sort()
        .join(',')
    );
    expect(byName.access.tools).toHaveLength(7);
    expect([...byName.access.tools].sort().join(',')).toBe(
      [
        'moveit_list_user_groups',
        'moveit_get_user_group',
        'moveit_list_acls',
        'moveit_get_acl',
        'moveit_add_acl',
        'moveit_update_acl',
        'moveit_delete_acl',
      ]
        .sort()
        .join(',')
    );
    const groupToolTotal = parsed.groups.reduce(
      (sum, g) => sum + g.tools.length,
      0
    );
    expect(groupToolTotal).toBe(49);
    expect(parsed.groups.filter((g) => g.enabled).map((g) => g.name)).toEqual([
      'info',
      'tasks',
      'reports',
    ]);
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
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws ConfigError naming missing vars before any fetch', async () => {
    await expect(runMain({ MOVEIT_BASE_URL: 'https://x' })).rejects.toThrow(
      ConfigError
    );
    await expect(runMain({})).rejects.toThrow(
      /MOVEIT_BASE_URL, MOVEIT_USERNAME, MOVEIT_PASSWORD/u
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
      code: number
    ) => {
      throw new Error(`exit:${code}`);
    }) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // silence stderr
    });
    await expect(main()).rejects.toThrow('exit:1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Missing required environment variables')
    );
  });
});

describe('createServer with MOVEIT_CA_FILE', () => {
  it('throws ConfigError naming MOVEIT_CA_FILE when the CA file is missing', () => {
    const missing = '/nonexistent/moveit-ca-bundle.pem';
    expect(() => createServer({ ...validConfig, caFile: missing })).toThrow(
      ConfigError
    );
    expect(() => createServer({ ...validConfig, caFile: missing })).toThrow(
      /MOVEIT_CA_FILE/u
    );
    expect(() => createServer({ ...validConfig, caFile: missing })).toThrow(
      // biome-ignore lint/style/useUnicodeRegex: v-flag regex requires an ES2024 target
      new RegExp(missing.replace(/[/.]/gu, '\\$&'))
    );
  });
});
