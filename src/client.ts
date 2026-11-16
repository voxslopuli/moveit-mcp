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
}

export class MoveitClient {
  private readonly baseUrl: string;
  private readonly tokenManager: TokenManager;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: Config, tokenManager: TokenManager, opts?: ClientOptions) {
    this.baseUrl = cfg.baseUrl;
    this.tokenManager = tokenManager;
    this.fetchImpl = opts?.fetchImpl ?? fetch;
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
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
    });
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
}
