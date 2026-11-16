import { MoveitApiError } from './api-error.js';
import type { Config } from './config.js';
import { redactPrivateIps } from './redact.js';
import type { TokenManager } from './token-manager.js';

export type ReportKind = 'audit' | 'fileactivity' | 'taskruns';

export interface ReportQuery {
  maxCount?: number;
  orderBy?: string;
  predicate: string;
}

const VALID_RESOURCES = new Set([
  'hosts',
  'taskgroups',
  'globalparameters',
  'customscripts',
  'datelists',
  'pgpkeys',
  'sshkeys',
  'tasks',
]);

interface ApiErrorBody {
  detail?: string;
  error?: string;
  error_description?: string;
  errorCode?: string;
  status?: number;
  title?: string;
}

interface ClientOptions {
  /** undici dispatcher (e.g. an Agent with a custom CA) passed on every fetch. */
  dispatcher?: unknown;
  fetchImpl?: typeof fetch;
}

function assertResource(resource: string): void {
  if (!VALID_RESOURCES.has(resource)) {
    throw new Error(`Unknown MOVEit resource: ${resource}`);
  }
}

async function throwApiError(res: Response): Promise<never> {
  const { status } = res;
  let detail = `Request failed with status ${status}`;
  try {
    const {
      detail: apiDetail,
      error_description,
      error,
      title,
    } = (await res.json()) as ApiErrorBody;
    // Never include token or credential values in messages.
    detail = apiDetail || error_description || error || title || detail;
  } catch {
    // keep default status message
  }
  throw new MoveitApiError(status, redactPrivateIps(detail));
}

function buildQuery(params?: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}

export class MoveitClient {
  private readonly baseUrl: string;
  private readonly tokenManager: TokenManager;
  private readonly fetchImpl: typeof fetch;

  private readonly dispatcher: unknown;

  constructor(cfg: Config, tokenManager: TokenManager, opts?: ClientOptions) {
    this.baseUrl = cfg.baseUrl;
    this.tokenManager = tokenManager;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.dispatcher = opts?.dispatcher;
  }

  async info(): Promise<unknown> {
    return await this.request('GET', '/api/v1/info');
  }

  async list(
    resource: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    assertResource(resource);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return await this.request(
      'GET',
      `/api/v1/${resource}${qs ? `?${qs}` : ''}`
    );
  }

  async get<T = unknown>(resource: string, id: string): Promise<T> {
    assertResource(resource);
    return await this.request<T>('GET', `/api/v1/${resource}/${id}`);
  }

  async runningTasks(): Promise<unknown> {
    return await this.request('GET', '/api/v1/tasks/running');
  }

  async startTask(
    id: string,
    params?: Record<string, string>
  ): Promise<unknown> {
    return await this.request('POST', `/api/v1/tasks/${id}/start`, params);
  }

  async stopTask(id: string): Promise<unknown> {
    return await this.request('POST', `/api/v1/tasks/${id}/stop`);
  }

  async setScheduler(action: 'start' | 'stop'): Promise<void> {
    await this.request('PUT', `/api/v1/tasks/scheduler/${action}`);
  }

  async getConfig(): Promise<unknown> {
    return await this.request('GET', '/api/v1/config');
  }

  async putConfig(config: unknown): Promise<unknown> {
    return await this.request('PUT', '/api/v1/config', config);
  }

  async createTask(task: unknown): Promise<unknown> {
    return await this.request('POST', '/api/v1/tasks', task);
  }

  async updateTask(id: string, task: unknown): Promise<unknown> {
    return await this.request('PUT', `/api/v1/tasks/${id}`, task);
  }

  async deleteTask(id: string): Promise<unknown> {
    return await this.request('DELETE', `/api/v1/tasks/${id}`);
  }

  async report(kind: ReportKind, q: ReportQuery): Promise<unknown> {
    const body: Record<string, unknown> = { predicate: q.predicate };
    if (q.orderBy !== undefined) {
      body.orderBy = q.orderBy;
    }
    if (q.maxCount !== undefined) {
      body.maxCount = q.maxCount;
    }
    return await this.request('POST', `/api/v1/reports/${kind}`, body);
  }

  async shutdown(): Promise<void> {
    await this.tokenManager.revoke();
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    jsonBody?: unknown,
    retry = true
  ): Promise<T> {
    const token = await this.tokenManager.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    let body: string | undefined;
    if (jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(jsonBody);
    }
    const init: Record<string, unknown> = { method, headers, body };
    if (this.dispatcher !== undefined) {
      init.dispatcher = this.dispatcher;
    }
    const res = await this.fetchImpl(
      `${this.baseUrl}${path}`,
      init as RequestInit
    );
    if (res.status === 401 && retry) {
      this.tokenManager.invalidate();
      return this.request<T>(method, path, jsonBody, false);
    }
    if (!res.ok) {
      await throwApiError(res);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  async listTaskLogs(
    taskId: string,
    params?: {
      name?: string;
      fields?: string;
      page?: number;
      perPage?: number;
    }
  ): Promise<unknown> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return await this.request(
      'GET',
      `/api/v1/tasks/${taskId}/log${qs ? `?${qs}` : ''}`
    );
  }

  async getTaskLog(taskId: string, taskLogId: string): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/tasks/${taskId}/log/${taskLogId}`
    );
  }

  async killTask(taskId: string): Promise<unknown> {
    return await this.request('POST', `/api/v1/tasks/${taskId}/kill`);
  }

  async getSchedulerStatus(): Promise<unknown> {
    return await this.request('GET', '/api/v1/tasks/scheduler');
  }

  async exportReport(kind: ReportKind, q: ReportQuery): Promise<unknown> {
    const body: Record<string, unknown> = {
      reportType: kind,
      predicate: q.predicate,
    };
    if (q.orderBy !== undefined) {
      body.orderBy = q.orderBy;
    }
    if (q.maxCount !== undefined) {
      body.maxCount = q.maxCount;
    }
    return await this.request('POST', '/api/v1/reports/export', body);
  }

  async exportConfigV2(opts: {
    passphrase?: string;
    sanitize?: boolean;
  }): Promise<unknown> {
    const body: Record<string, unknown> = {};
    if (opts.passphrase !== undefined) {
      body.passphrase = opts.passphrase;
    }
    if (opts.sanitize !== undefined) {
      body.sanitize = opts.sanitize;
    }
    return await this.request('POST', '/api/v1/config', body);
  }

  async importConfigV2(
    configXML: string,
    passphrase: string
  ): Promise<unknown> {
    return await this.request('POST', '/api/v1/config/import', {
      configXML,
      passphrase,
    });
  }

  async listSSLCerts(params?: {
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return await this.request('GET', `/api/v1/sslcerts${buildQuery(params)}`);
  }

  async getSSLCert(sslCertificateThumbprint: string): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/sslcerts/${sslCertificateThumbprint}`
    );
  }

  async listStandardScripts(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/standardscripts${buildQuery(params)}`
    );
  }

  async getStandardScript(standardScriptId: string): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/standardscripts/${standardScriptId}`
    );
  }

  async listUserGroups(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return await this.request('GET', `/api/v1/usergroups${buildQuery(params)}`);
  }

  async getUserGroup(userGroupName: string): Promise<unknown> {
    return await this.request('GET', `/api/v1/usergroups/${userGroupName}`);
  }

  async listResourceGroups(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/resourcegroups${buildQuery(params)}`
    );
  }

  async getResourceGroup(resourceGroupName: string): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/resourcegroups/${resourceGroupName}`
    );
  }

  async listACLs(params?: {
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return await this.request(
      'GET',
      `/api/v1/resourcegroups/acls${buildQuery(params)}`
    );
  }

  async getACL(aclId: string): Promise<unknown> {
    return await this.request('GET', `/api/v1/resourcegroups/acls/${aclId}`);
  }

  async addACL(acl: unknown): Promise<unknown> {
    return await this.request('POST', '/api/v1/resourcegroups/acls', acl);
  }

  async updateACL(aclId: string, acl: unknown): Promise<unknown> {
    return await this.request(
      'PUT',
      `/api/v1/resourcegroups/acls/${aclId}`,
      acl
    );
  }

  async deleteACL(aclId: string): Promise<unknown> {
    return await this.request('DELETE', `/api/v1/resourcegroups/acls/${aclId}`);
  }
}
