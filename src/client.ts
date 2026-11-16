import type { Config } from './config.js';
import type { TokenManager } from './token-manager.js';

export class MoveitApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'MoveitApiError';
    this.status = status;
    this.detail = detail;
  }
}

export type ReportKind = 'audit' | 'fileactivity' | 'taskruns';

export interface ReportQuery {
  predicate: string;
  orderBy?: string;
  maxCount?: number;
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
  status?: number;
  title?: string;
  errorCode?: string;
  error?: string;
  error_description?: string;
}

interface ClientOptions {
  fetchImpl?: typeof fetch;
  /** undici dispatcher (e.g. an Agent with a custom CA) passed on every fetch. */
  dispatcher?: unknown;
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
    return this.request('GET', '/api/v1/info');
  }

  async list(
    resource: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    this.assertResource(resource);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return this.request('GET', `/api/v1/${resource}${qs ? `?${qs}` : ''}`);
  }

  async get<T = unknown>(resource: string, id: string): Promise<T> {
    this.assertResource(resource);
    return this.request<T>('GET', `/api/v1/${resource}/${id}`);
  }

  async runningTasks(): Promise<unknown> {
    return this.request('GET', '/api/v1/tasks/running');
  }

  async startTask(
    id: string,
    params?: Record<string, string>,
  ): Promise<unknown> {
    return this.request('POST', `/api/v1/tasks/${id}/start`, params);
  }

  async stopTask(id: string): Promise<unknown> {
    return this.request('POST', `/api/v1/tasks/${id}/stop`);
  }

  async setScheduler(action: 'start' | 'stop'): Promise<void> {
    await this.request('PUT', `/api/v1/tasks/scheduler/${action}`);
  }

  async getConfig(): Promise<unknown> {
    return this.request('GET', '/api/v1/config');
  }

  async putConfig(config: unknown): Promise<unknown> {
    return this.request('PUT', '/api/v1/config', config);
  }

  async createTask(task: unknown): Promise<unknown> {
    return this.request('POST', '/api/v1/tasks', task);
  }

  async updateTask(id: string, task: unknown): Promise<unknown> {
    return this.request('PUT', `/api/v1/tasks/${id}`, task);
  }

  async deleteTask(id: string): Promise<unknown> {
    return this.request('DELETE', `/api/v1/tasks/${id}`);
  }

  async report(kind: ReportKind, q: ReportQuery): Promise<unknown> {
    const body: Record<string, unknown> = { predicate: q.predicate };
    if (q.orderBy !== undefined) body.orderBy = q.orderBy;
    if (q.maxCount !== undefined) body.maxCount = q.maxCount;
    return this.request('POST', `/api/v1/reports/${kind}`, body);
  }

  async shutdown(): Promise<void> {
    await this.tokenManager.revoke();
  }

  private assertResource(resource: string): void {
    if (!VALID_RESOURCES.has(resource)) {
      throw new Error(`Unknown MOVEit resource: ${resource}`);
    }
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    jsonBody?: unknown,
    retry = true,
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
    if (this.dispatcher !== undefined) init.dispatcher = this.dispatcher;
    const res = await this.fetchImpl(
      `${this.baseUrl}${path}`,
      init as RequestInit,
    );
    if (res.status === 401 && retry) {
      this.tokenManager.invalidate();
      return this.request<T>(method, path, jsonBody, false);
    }
    if (!res.ok) {
      await this.throwApiError(res);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  private async throwApiError(res: Response): Promise<never> {
    const status = res.status;
    let detail = `Request failed with status ${status}`;
    try {
      const err = (await res.json()) as ApiErrorBody;
      // Never include token or credential values in messages.
      if (err.detail) {
        detail = err.detail;
      } else if (err.error_description) {
        detail = err.error_description;
      } else if (err.error) {
        detail = err.error;
      } else if (err.title) {
        detail = err.title;
      }
    } catch {
      // keep default status message
    }
    throw new MoveitApiError(status, detail);
  }
  async listTaskLogs(
    taskId: string,
    params?: {
      name?: string;
      fields?: string;
      page?: number;
      perPage?: number;
    },
  ): Promise<unknown> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return this.request(
      'GET',
      `/api/v1/tasks/${taskId}/log${qs ? `?${qs}` : ''}`,
    );
  }

  async getTaskLog(taskId: string, taskLogId: string): Promise<unknown> {
    return this.request('GET', `/api/v1/tasks/${taskId}/log/${taskLogId}`);
  }

  async killTask(taskId: string): Promise<unknown> {
    return this.request('POST', `/api/v1/tasks/${taskId}/kill`);
  }

  async getSchedulerStatus(): Promise<unknown> {
    return this.request('GET', '/api/v1/tasks/scheduler');
  }

  async exportReport(kind: ReportKind, q: ReportQuery): Promise<unknown> {
    const body: Record<string, unknown> = {
      reportType: kind,
      predicate: q.predicate,
    };
    if (q.orderBy !== undefined) body.orderBy = q.orderBy;
    if (q.maxCount !== undefined) body.maxCount = q.maxCount;
    return this.request('POST', '/api/v1/reports/export', body);
  }

  async exportConfigV2(opts: {
    passphrase?: string;
    sanitize?: boolean;
  }): Promise<unknown> {
    const body: Record<string, unknown> = {};
    if (opts.passphrase !== undefined) body.passphrase = opts.passphrase;
    if (opts.sanitize !== undefined) body.sanitize = opts.sanitize;
    return this.request('POST', '/api/v1/config', body);
  }

  async importConfigV2(
    configXML: string,
    passphrase: string,
  ): Promise<unknown> {
    return this.request('POST', '/api/v1/config/import', {
      configXML,
      passphrase,
    });
  }

  async listSSLCerts(params?: {
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return this.request('GET', `/api/v1/sslcerts${this.buildQuery(params)}`);
  }

  async getSSLCert(sslCertificateThumbprint: string): Promise<unknown> {
    return this.request('GET', `/api/v1/sslcerts/${sslCertificateThumbprint}`);
  }

  async listStandardScripts(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return this.request(
      'GET',
      `/api/v1/standardscripts${this.buildQuery(params)}`,
    );
  }

  async getStandardScript(standardScriptId: string): Promise<unknown> {
    return this.request('GET', `/api/v1/standardscripts/${standardScriptId}`);
  }

  async listUserGroups(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return this.request('GET', `/api/v1/usergroups${this.buildQuery(params)}`);
  }

  async getUserGroup(userGroupName: string): Promise<unknown> {
    return this.request('GET', `/api/v1/usergroups/${userGroupName}`);
  }

  async listResourceGroups(params?: {
    name?: string;
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return this.request(
      'GET',
      `/api/v1/resourcegroups${this.buildQuery(params)}`,
    );
  }

  async getResourceGroup(resourceGroupName: string): Promise<unknown> {
    return this.request('GET', `/api/v1/resourcegroups/${resourceGroupName}`);
  }

  async listACLs(params?: {
    fields?: string;
    page?: number;
    perPage?: number;
  }): Promise<unknown> {
    return this.request(
      'GET',
      `/api/v1/resourcegroups/acls${this.buildQuery(params)}`,
    );
  }

  async getACL(aclId: string): Promise<unknown> {
    return this.request('GET', `/api/v1/resourcegroups/acls/${aclId}`);
  }

  async addACL(acl: unknown): Promise<unknown> {
    return this.request('POST', '/api/v1/resourcegroups/acls', acl);
  }

  async updateACL(aclId: string, acl: unknown): Promise<unknown> {
    return this.request('PUT', `/api/v1/resourcegroups/acls/${aclId}`, acl);
  }

  async deleteACL(aclId: string): Promise<unknown> {
    return this.request('DELETE', `/api/v1/resourcegroups/acls/${aclId}`);
  }

  private buildQuery(params?: Record<string, unknown>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        query.set(key, String(value));
      }
    }
    const qs = query.toString();
    return qs ? `?${qs}` : '';
  }
}
