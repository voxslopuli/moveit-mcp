import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MoveitApiError, MoveitClient } from '../src/client.js';
import type { Config } from '../src/config.js';
import type { TokenManager } from '../src/token-manager.js';

const cfg: Config = {
  baseUrl: 'https://moveit.example.com',
  username: 'user',
  password: 'pass',
  tlsRejectUnauthorized: true,
};

interface QueuedResponse {
  status: number;
  body: unknown;
}

function jsonRes(status: number, body: unknown): Response {
  if (body === '') {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stub TokenManager: returns queued tokens; invalidate() advances the queue. */
function stubTokenManager(tokens: string[]) {
  let index = 0;
  const invalidated = vi.fn();
  const revoked = vi.fn();
  const tm = {
    getToken: vi.fn(async () => {
      const token = tokens[Math.min(index, tokens.length - 1)];
      return token;
    }),
    invalidate: vi.fn(() => {
      invalidated();
      index += 1;
    }),
    revoke: revoked,
  };
  return { tm, invalidated, revoked };
}

describe('MoveitClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let queue: QueuedResponse[];
  let calls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    queue = [];
    calls = [];
    fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = queue.shift();
      if (!next) throw new Error('fetch called with empty response queue');
      return jsonRes(next.status, next.body);
    });
  });

  function makeClient(tokens: string[]) {
    const stub = stubTokenManager(tokens);
    const client = new MoveitClient(cfg, stub.tm as unknown as TokenManager, {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    return { client, ...stub };
  }

  it('sends Bearer token and hits GET /api/v1/info', async () => {
    queue.push({ status: 200, body: { version: '2023.0' } });
    const { client } = makeClient(['tok1']);
    await client.info();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/info');
    expect(calls[0].init.method).toBe('GET');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Authorization')).toBe('Bearer tok1');
  });

  it('list encodes query params, skipping undefined', async () => {
    queue.push({ status: 200, body: [] });
    const { client } = makeClient(['tok1']);
    await client.list('hosts', { page: 1, perPage: 10, name: undefined });
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/hosts?page=1&perPage=10',
    );
    expect(calls[0].init.method).toBe('GET');
  });

  it('list rejects unknown resources', async () => {
    const { client } = makeClient(['tok1']);
    await expect(client.list('users')).rejects.toThrow(Error);
    await expect(client.list('users')).rejects.not.toBeInstanceOf(
      MoveitApiError,
    );
    expect(calls).toHaveLength(0);
  });

  it('get hits /api/v1/{resource}/{id}', async () => {
    queue.push({ status: 200, body: { id: '42', name: 'h1' } });
    const { client } = makeClient(['tok1']);
    const host = await client.get<{ id: string }>('hosts', '42');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/hosts/42');
    expect(host.id).toBe('42');
  });

  it('startTask POSTs JSON body to /api/v1/tasks/{id}/start', async () => {
    queue.push({ status: 200, body: { ok: true } });
    const { client } = makeClient(['tok1']);
    await client.startTask('42', { comment: 'go' });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/tasks/42/start',
    );
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].init.body).toBe(JSON.stringify({ comment: 'go' }));
  });

  it('stopTask POSTs to /api/v1/tasks/{id}/stop', async () => {
    queue.push({ status: 200, body: { ok: true } });
    const { client } = makeClient(['tok1']);
    await client.stopTask('42');
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/tasks/42/stop',
    );
  });

  it('setScheduler("stop") PUTs /api/v1/tasks/scheduler/stop', async () => {
    queue.push({ status: 200, body: '' });
    const { client } = makeClient(['tok1']);
    await client.setScheduler('stop');
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/tasks/scheduler/stop',
    );
  });

  it('on 401: invalidates and retries once with the fresh token', async () => {
    queue.push({ status: 401, body: { error: 'invalid_token' } });
    queue.push({ status: 200, body: { value: [] } });
    const { client, invalidated } = makeClient(['tok1', 'tok2']);
    const data = await client.list('hosts');
    expect(data).toEqual({ value: [] });
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    const h1 = new Headers(calls[0].init.headers).get('Authorization');
    const h2 = new Headers(calls[1].init.headers).get('Authorization');
    expect(h1).toBe('Bearer tok1');
    expect(h2).toBe('Bearer tok2');
  });

  it('on second 401: throws MoveitApiError with status 401 and detail', async () => {
    queue.push({ status: 401, body: { error: 'invalid_token' } });
    queue.push({ status: 401, body: { error_description: 'expired twice' } });
    const { client, invalidated } = makeClient(['tok1', 'tok2']);
    const err = await client.list('hosts').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MoveitApiError);
    const apiErr = err as MoveitApiError;
    expect(apiErr.status).toBe(401);
    expect(apiErr.message).toContain('expired twice');
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
  });

  it('maps server error body {detail,status,title} into MoveitApiError', async () => {
    queue.push({
      status: 422,
      body: {
        title: 'Bad request',
        detail: 'predicate is invalid',
        status: 422,
      },
    });
    const { client } = makeClient(['tok1']);
    const err = await client.list('hosts').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MoveitApiError);
    const apiErr = err as MoveitApiError;
    expect(apiErr.status).toBe(422);
    expect(apiErr.detail).toBe('predicate is invalid');
    expect(apiErr.message).toContain('predicate is invalid');
  });

  it('maps token-style error body {error, error_description} into MoveitApiError', async () => {
    queue.push({
      status: 403,
      body: { error: 'access_denied', error_description: 'no permission' },
    });
    const { client } = makeClient(['tok1']);
    const err = await client.stopTask('7').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MoveitApiError);
    expect((err as MoveitApiError).status).toBe(403);
    expect((err as MoveitApiError).message).toContain('no permission');
  });

  it('report POSTs JSON body verbatim, preserving quotes in predicate', async () => {
    queue.push({ status: 200, body: { records: [] } });
    const { client } = makeClient(['tok1']);
    await client.report('audit', {
      predicate: 'FileName = "secret.txt"',
      orderBy: 'Time',
      maxCount: 100,
    });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/reports/audit',
    );
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].init.body).toBe(
      '{"predicate":"FileName = \\"secret.txt\\"","orderBy":"Time","maxCount":100}',
    );
  });

  it('shutdown delegates to tokenManager.revoke()', async () => {
    const { client, revoked } = makeClient(['tok1']);
    await client.shutdown();
    expect(revoked).toHaveBeenCalledTimes(1);
  });
  it('runningTasks GETs /api/v1/tasks/running', async () => {
    queue.push({ status: 200, body: [] });
    const { client } = makeClient(['tok1']);
    const result = await client.runningTasks();
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].url).toBe(
      'https://moveit.example.com/api/v1/tasks/running',
    );
    expect(result).toEqual([]);
  });

  it('getConfig GETs /api/v1/config', async () => {
    queue.push({ status: 200, body: { settings: [] } });
    const { client } = makeClient(['tok1']);
    const result = await client.getConfig();
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/config');
    expect(result).toEqual({ settings: [] });
  });

  it('putConfig PUTs full AdminConfigModel JSON verbatim and returns updated config', async () => {
    const config = { settings: [{ name: 'ftp.passive', value: 'true' }] };
    queue.push({ status: 200, body: config });
    const { client } = makeClient(['tok1']);
    const result = await client.putConfig(config);
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/config');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(config);
    expect(result).toEqual(config);
  });

  it('createTask POSTs Task JSON to /api/v1/tasks and returns created task', async () => {
    const task = { Name: 'nightly transfer', Type: 'Traditional' };
    queue.push({ status: 201, body: { ...task, ID: '42' } });
    const { client } = makeClient(['tok1']);
    const result = await client.createTask(task);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/tasks');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(task);
    expect(result).toEqual({ ...task, ID: '42' });
  });

  it('updateTask PUTs full Task JSON to /api/v1/tasks/{id} and returns updated task', async () => {
    const task = { Name: 'renamed task', Type: 'Traditional' };
    queue.push({ status: 200, body: { ...task, ID: '42' } });
    const { client } = makeClient(['tok1']);
    const result = await client.updateTask('42', task);
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/tasks/42');
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(task);
    expect(result).toEqual({ ...task, ID: '42' });
  });

  it('deleteTask sends DELETE to /api/v1/tasks/{id} and handles empty body', async () => {
    queue.push({ status: 200, body: '' });
    const { client } = makeClient(['tok1']);
    const result = await client.deleteTask('42');
    expect(calls[0].init.method).toBe('DELETE');
    expect(calls[0].url).toBe('https://moveit.example.com/api/v1/tasks/42');
    expect(calls[0].init.body).toBeUndefined();
    expect(result).toBeNull();
  });
  describe('task logs / kill / scheduler status / report export / config v2', () => {
    it('listTaskLogs GETs /api/v1/tasks/{id}/log with query params', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listTaskLogs('42', {
        name: 'run1',
        fields: 'TaskLogID',
        page: 2,
        perPage: 10,
      });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/tasks/42/log?name=run1&fields=TaskLogID&page=2&perPage=10',
      );
    });

    it('listTaskLogs without params has no query string', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listTaskLogs('42');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/tasks/42/log',
      );
    });

    it('getTaskLog GETs /api/v1/tasks/{id}/log/{logId}', async () => {
      queue.push({ status: 200, body: { LogData: 'hello' } });
      const { client } = makeClient(['tok1']);
      const log = await client.getTaskLog('42', '987');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/tasks/42/log/987',
      );
      expect(log).toEqual({ LogData: 'hello' });
    });

    it('killTask POSTs to /api/v1/tasks/{id}/kill', async () => {
      queue.push({ status: 200, body: { ok: true } });
      const { client } = makeClient(['tok1']);
      await client.killTask('42');
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/tasks/42/kill',
      );
      expect(calls[0].init.body).toBeUndefined();
    });

    it('getSchedulerStatus GETs /api/v1/tasks/scheduler', async () => {
      queue.push({ status: 200, body: { Status: 'Stopped' } });
      const { client } = makeClient(['tok1']);
      const status = await client.getSchedulerStatus();
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/tasks/scheduler',
      );
      expect(status).toEqual({ Status: 'Stopped' });
    });

    it('exportReport POSTs reportType plus query to /api/v1/reports/export', async () => {
      queue.push({ status: 200, body: { ID: 'r1' } });
      const { client } = makeClient(['tok1']);
      await client.exportReport('taskruns', {
        predicate: 'Status=in=("Success")',
        orderBy: '!StartTime',
        maxCount: 50,
      });
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/reports/export',
      );
      expect(calls[0].init.body).toBe(
        '{"reportType":"taskruns","predicate":"Status=in=(\\"Success\\")","orderBy":"!StartTime","maxCount":50}',
      );
    });

    it('exportConfigV2 POSTs passphrase/sanitize to /api/v1/config', async () => {
      queue.push({ status: 200, body: { configXML: '<config/>' } });
      const { client } = makeClient(['tok1']);
      await client.exportConfigV2({ passphrase: 'pw', sanitize: true });
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].url).toBe('https://moveit.example.com/api/v1/config');
      expect(JSON.parse(String(calls[0].init.body))).toEqual({
        passphrase: 'pw',
        sanitize: true,
      });
    });

    it('importConfigV2 POSTs configXML and passphrase to /api/v1/config/import', async () => {
      queue.push({ status: 204, body: '' });
      const { client } = makeClient(['tok1']);
      const result = await client.importConfigV2('<config/>', 'pw');
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/config/import',
      );
      expect(JSON.parse(String(calls[0].init.body))).toEqual({
        configXML: '<config/>',
        passphrase: 'pw',
      });
      expect(result).toBeNull();
    });
  });

  describe('2024.1 endpoints: sslcerts, standardscripts, usergroups, resourcegroups, acls', () => {
    it('listSSLCerts GETs /api/v1/sslcerts with fields/page/perPage only', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listSSLCerts({ fields: 'Thumbprint', page: 1, perPage: 25 });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/sslcerts?fields=Thumbprint&page=1&perPage=25',
      );
    });

    it('listSSLCerts without params has no query string', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listSSLCerts();
      expect(calls[0].url).toBe('https://moveit.example.com/api/v1/sslcerts');
    });

    it('getSSLCert GETs /api/v1/sslcerts/{thumbprint}', async () => {
      queue.push({ status: 200, body: { Thumbprint: 'AB12', Name: 'ca' } });
      const { client } = makeClient(['tok1']);
      const cert = await client.getSSLCert('AB12');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/sslcerts/AB12',
      );
      expect(cert).toEqual({ Thumbprint: 'AB12', Name: 'ca' });
    });

    it('listStandardScripts GETs /api/v1/standardscripts with name filter', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listStandardScripts({ name: 'rotate', page: 2, perPage: 10 });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/standardscripts?name=rotate&page=2&perPage=10',
      );
    });

    it('getStandardScript GETs /api/v1/standardscripts/{standardScriptId}', async () => {
      queue.push({ status: 200, body: { Name: 'rotate' } });
      const { client } = makeClient(['tok1']);
      const script = await client.getStandardScript('rotate');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/standardscripts/rotate',
      );
      expect(script).toEqual({ Name: 'rotate' });
    });

    it('listUserGroups GETs /api/v1/usergroups with name filter', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listUserGroups({ name: 'admins' });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/usergroups?name=admins',
      );
    });

    it('getUserGroup GETs /api/v1/usergroups/{userGroupName}', async () => {
      queue.push({ status: 200, body: { Name: 'admins' } });
      const { client } = makeClient(['tok1']);
      const group = await client.getUserGroup('admins');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/usergroups/admins',
      );
      expect(group).toEqual({ Name: 'admins' });
    });

    it('listResourceGroups GETs /api/v1/resourcegroups with pagination', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listResourceGroups({ page: 1, perPage: 50 });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups?page=1&perPage=50',
      );
    });

    it('getResourceGroup GETs /api/v1/resourcegroups/{resourceGroupName}', async () => {
      queue.push({ status: 200, body: { Name: 'reports' } });
      const { client } = makeClient(['tok1']);
      const group = await client.getResourceGroup('reports');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/reports',
      );
      expect(group).toEqual({ Name: 'reports' });
    });

    it('listACLs GETs /api/v1/resourcegroups/acls', async () => {
      queue.push({ status: 200, body: { items: [] } });
      const { client } = makeClient(['tok1']);
      await client.listACLs({ fields: 'ID', page: 1, perPage: 10 });
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/acls?fields=ID&page=1&perPage=10',
      );
    });

    it('getACL GETs /api/v1/resourcegroups/acls/{aclId}', async () => {
      queue.push({ status: 200, body: { ID: '99' } });
      const { client } = makeClient(['tok1']);
      const acl = await client.getACL('99');
      expect(calls[0].init.method).toBe('GET');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/acls/99',
      );
      expect(acl).toEqual({ ID: '99' });
    });

    it('addACL POSTs verbatim JSON to /api/v1/resourcegroups/acls', async () => {
      const acl = { Type: 'usergroup', Permission: 15, TargetName: 'admins' };
      queue.push({ status: 201, body: { ...acl, ID: '5' } });
      const { client } = makeClient(['tok1']);
      await client.addACL(acl);
      expect(calls[0].init.method).toBe('POST');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/acls',
      );
      expect(JSON.parse(String(calls[0].init.body))).toEqual(acl);
    });

    it('updateACL PUTs verbatim JSON to /api/v1/resourcegroups/acls/{aclId}', async () => {
      const acl = { ID: '5', Permission: 7 };
      queue.push({ status: 200, body: acl });
      const { client } = makeClient(['tok1']);
      await client.updateACL('5', acl);
      expect(calls[0].init.method).toBe('PUT');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/acls/5',
      );
      expect(JSON.parse(String(calls[0].init.body))).toEqual(acl);
    });

    it('deleteACL sends DELETE to /api/v1/resourcegroups/acls/{aclId}', async () => {
      queue.push({ status: 200, body: '' });
      const { client } = makeClient(['tok1']);
      const result = await client.deleteACL('5');
      expect(calls[0].init.method).toBe('DELETE');
      expect(calls[0].url).toBe(
        'https://moveit.example.com/api/v1/resourcegroups/acls/5',
      );
      expect(calls[0].init.body).toBeUndefined();
      expect(result).toBeNull();
    });
  });

});
