import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Config, ConfigError } from '../src/config.js';
import { createServer, main, runMain } from '../src/index.js';

const validConfig: Config = {
  baseUrl: 'https://moveit.example.com',
  username: 'svc',
  password: 'secret',
  tlsRejectUnauthorized: true,
};

const EXPECTED_TOOLS = [
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
  'moveit_get_info',
  'moveit_list_pgp_keys',
  'moveit_get_pgp_key',
  'moveit_list_ssh_keys',
  'moveit_get_ssh_key',
  'moveit_list_tasks',
  'moveit_get_task',
  'moveit_list_running_tasks',
  'moveit_start_task',
  'moveit_stop_task',
  'moveit_set_scheduler',
  'moveit_audit_report',
  'moveit_file_activity_report',
  'moveit_task_runs_report',
  'moveit_get_config',
  'moveit_put_config',
  'moveit_create_task',
  'moveit_update_task',
  'moveit_delete_task',
];

describe('createServer', () => {
  it('registers exactly the expected moveit_ tools', async () => {
    const srv = createServer(validConfig);
    const registry = (
      srv.server as unknown as {
        _registeredTools: Record<string, unknown>;
      }
    )._registeredTools;
    const names = Object.keys(registry).sort();
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
