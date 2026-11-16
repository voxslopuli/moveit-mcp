# MOVEit Automation MCP Server Implementation Plan
> Addendum: final tool count is 24 (17 was a miscount; moveit_get_info added during Task 11).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A stdio MCP server exposing MOVEit Automation REST API operations (task control, config object browsing, audit reporting) as MCP tools, authenticated via environment-variable credentials.

**Architecture:** Three layers — `MoveitClient` (typed HTTP wrapper with token lifecycle), `tools/` (one module per resource family, each exporting `register(server, client)`), `index.ts` (McpServer wiring + stdio transport). Token refresh is proactive (expiry − 60 s) with one 401-retry fallback.

**Tech Stack:** TypeScript (ESM, Node ≥ 20), `@modelcontextprotocol/server` v2 + `zod/v4`, tsup (build), tsx (dev), Vitest, Biome (lint+format), husky + lint-staged.

**Spec:** MOVEit Automation REST API docs (https://docs.ipswitch.com/MOVEit/Automation2018/API/REST-API/index.html), MCP concepts (modelcontextprotocol.io), MCP TS SDK v2 (github.com/modelcontextprotocol/typescript-sdk — v2 packages `@modelcontextprotocol/server`, Standard Schema input via Zod v4).

## Global Constraints

- Credentials come **only** from env: `MOVEIT_BASE_URL` (required, e.g. `https://host/webadmin`), `MOVEIT_USERNAME` (required), `MOVEIT_PASSWORD` (required), `MOVEIT_SERVER_HOST` (optional — passed as `server_host` form field when set), `MOVEIT_TLS_REJECT_UNAUTHORIZED` (optional, `"false"` to accept self-signed certs; default `true`).
- Missing required env → fail fast at startup with a message naming every missing var; never prompt.
- All API calls go to `<MOVEIT_BASE_URL>/api/v1/...`; token endpoint is `<MOVEIT_BASE_URL>/api/v1/token`, content-type `application/x-www-form-urlencoded`.
- Tokens are never logged, never echoed in tool results, never included in error messages.
- `MOVEIT_PASSWORD` never appears in tool input schemas.
- Server speaks **stdio** only; no HTTP listener.
- Tool names prefixed `moveit_`. Schemas defined with `zod/v4` (SDK v2 Standard Schema).
- Mutating tools (`moveit_start_task`, `moveit_stop_task`, `moveit_set_scheduler`) declare `description` text stating they mutate server state.
- All list endpoints share the query contract: `name`/`fields`/`page`/`perPage` (PGP keys use `uid` instead of `name`; hosts add `type`) — one shared `ListParams` zod object extended per family.
- Out of scope (v1): `GET/PUT /api/v1/config` (admin-only, destructive), task create/update/delete (`POST/PUT/DELETE /api/v1/tasks`) — deferred phase 2; token revoke on graceful shutdown is in scope.
- NOTE: project directory is not yet a git repo — Task 1 must run `git init` first.

## Review Focus

1. **Expired-token mid-session** (access token expires after 15 min of idle): client must transparently refresh and retry once — test pins: single 401 → refresh → retry succeeds, no error surfaced to caller.
2. **Self-signed TLS on non-prod hosts** (`MOVEIT_TLS_REJECT_UNAUTHORIZED=false`): connection must succeed; also pins that default (`true`) still rejects. Test uses a stubbed fetch agent flag.
3. **Predicates with quotes/backslashes in report queries**: `predicate='Status=="Failure"'` must round-trip uncorrupted (JSON body, not shell) — test pins exact body serialization.
4. **Server returns 422 for invalid page/perPage combos**: tool must surface MOVEit's `detail` message, not a generic 500-style error.
5. **Empty/failed credential env at startup**: process exits non-zero listing all missing `MOVEIT_*` vars before any MCP handshake — test pins the aggregated message.

---

### Task 1: Scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/index.ts` (stub)
- Test: `tests/smoke.test.ts`

- [ ] **Step 1: Write failing smoke test** — `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
describe("scaffold", () => {
  it("runs vitest", () => { expect(1).toBe(1); });
});
```

- [ ] **Step 2: `npx vitest run` → FAIL (no vitest installed).**
- [ ] **Step 3:** `npm init -y`; set `"type": "module"`, scripts: `dev` (`tsx src/index.ts`), `build` (`tsup`), `test` (`vitest run`), `lint` (`biome check .`), `format` (`biome check --write .`), `prepare` (`husky`). Install deps: `@modelcontextprotocol/server zod`; dev: `tsup tsx vitest @biomejs/biome husky lint-staged typescript @types/node`. `tsup.config.ts`: entry `src/index.ts`, format `esm`, target `node20`, banner `#!/usr/bin/env node`. `biome.json`: lint + format, quote style single. `lint-staged`: `"*.{ts,tsx}" → biome check --write`, `.husky/pre-commit` → `npx lint-staged`. Run `git init` first.
- [ ] **Step 4:** `npm test && npm run lint` → PASS.
- [ ] **Step 5:** Commit `chore: scaffold moveit-mcp with tsup/tsx/vitest/biome/husky`.

### Task 2: Config from environment

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env: Record<string, string | undefined>): Config` where `Config = { baseUrl: string; username: string; password: string; serverHost?: string; tlsRejectUnauthorized: boolean }`. Throws `ConfigError` with aggregated missing-var message.

- [ ] **Step 1: Failing tests** — valid env → parsed Config; `MOVEIT_TLS_REJECT_UNAUTHORIZED="false"` → `false`; default → `true`; missing USERNAME+PASSWORD → throws naming **both**; `baseUrl` trailing `/` stripped.
- [ ] **Step 2:** `npx vitest run tests/config.test.ts` → FAIL.
- [ ] **Step 3:** Implement `loadConfig` + exported `ConfigError`.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat: env-based config loader`.

### Task 3: Token manager

**Files:**
- Create: `src/token-manager.ts`
- Test: `tests/token-manager.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 2), injectable `fetch: typeof fetch`.
- Produces: `class TokenManager { constructor(cfg, fetchImpl?); getToken(): Promise<string>; invalidate(): void; revoke(): Promise<void> }`. Internals: password grant → `{ access_token, refresh_token, expires_in }`; proactive refresh when `Date.now() > expiresAt - 60_000`; `invalidate()` clears cached state (used by client on 401).

- [ ] **Step 1: Failing tests** (fetch stub returning queued `Response`s): first `getToken()` posts `grant_type=password&username=…&password=…` (+ `server_host` when configured) with `Content-Type: application/x-www-form-urlencoded` to `<baseUrl>/api/v1/token`; second call within validity returns cached token (stub called once); call after simulated expiry posts `grant_type=refresh_token`; `revoke()` posts `/api/v1/token/revoke` with `token=<access>`; token endpoint 400 (`{error, error_description}`) → throws with `error_description`, token value absent from message.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: MOVEit token lifecycle manager`.

### Task 4: HTTP client

**Files:**
- Create: `src/client.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
- Consumes: `TokenManager` (Task 3), injectable fetch.
- Produces: `class MoveitClient { info(): Promise<unknown>; list<T>(resource: string, params?: Record<string, unknown>): Promise<unknown>; get<T>(resource: string, id: string): Promise<T>; startTask(id: string, params?: Record<string,string>): Promise<unknown>; stopTask(id: string): Promise<unknown>; setScheduler(on: "start"|"stop"): Promise<void>; report(kind: "audit"|"fileactivity"|"taskruns", q: {predicate: string; orderBy?: string; maxCount?: number}): Promise<unknown> }` plus `class MoveitApiError extends Error { status: number; detail: string }`. `resource` is one of the REST path segments (`hosts`, `taskgroups`, `globalparameters`, `customscripts`, `datelists`, `pgpkeys`, `sshkeys`, `tasks`). One 401 → `tokenManager.invalidate()` + single retry.

- [ ] **Step 1: Failing tests:** `Authorization: Bearer <t>` header present; GET path `<baseUrl>/api/v1/hosts?page=1&perPage=10`; 401-then-200 sequence retried exactly once with a new token; 401 twice → `MoveitApiError` status 401; 422 body `{title, detail, status}` → error message contains `detail`; report POSTs JSON body `{predicate, orderBy, maxCount}` verbatim (predicate containing `"`) to `/api/v1/reports/audit`; `setScheduler("stop")` PUTs `/api/v1/tasks/scheduler/stop`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement generic request core + thin per-op methods. **Step 4:** PASS. **Step 5:** Commit `feat: MOVEit REST client with auth retry`.

### Task 5: Shared zod schemas + tool helpers

**Files:**
- Create: `src/schemas.ts`, `src/tools/util.ts`
- Test: `tests/schemas.test.ts`

**Interfaces:**
- Produces: `ListParamsSchema` (`page: z.number().int().positive().optional()`, `perPage` same, `fields: z.string().optional()`, `name: z.string().optional()`), `HostListParamsSchema` (adds `type: z.enum(["FileSystem","FTP","POP3","Share","siLock","SMTP","SSHFTP","AS1","AS2","AS3","S3"])`), `PgpListParamsSchema` (adds `uid` instead of `name`), `ReportQuerySchema` (`predicate: z.string()`, `orderBy: z.string().optional()`, `maxCount: z.number().int().positive().max(10000).optional()`), and `jsonResult(data: unknown)` returning `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }`.

- [ ] **Step 1: Failing tests:** schema parse/reject cases (perPage=0 rejected, invalid host type rejected, missing predicate rejected); `jsonResult` shape.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: shared tool schemas`.

### Task 6: Read-only resource tools (hosts, task groups, global parameters)

**Files:**
- Create: `src/tools/hosts.ts`, `src/tools/taskgroups.ts`, `src/tools/globalparameters.ts`
- Test: `tests/tools/resources.test.ts`

**Interfaces:**
- Consumes: `MoveitClient`, schemas (Task 5). Produces per module: `registerMoveitHosts(server: McpServer, client: MoveitClient): void` (same pattern for the other two).
- Tools: `moveit_list_hosts` (input: `HostListParamsSchema`), `moveit_get_host` (`{ hostId: z.string() }`), `moveit_list_task_groups` / `moveit_get_task_group` (`{ taskGroupName: z.string() }`), `moveit_list_global_parameters` / `moveit_get_global_parameter` (`{ name: z.string() }`).

- [ ] **Step 1: Failing tests:** build a real `McpServer` + SDK v2 `Client` connected via `InMemoryTransport.createLinkedPair()`; `MoveitClient` stubbed with vi.fn. For each tool: `client.callTool({ name, arguments })` → returns list/get fixture; stub asserted with exact REST path & query; invalid args → tool error.
- [ ] **Step 2:** FAIL. **Step 3:** Implement three register modules (identical shape; ~15 lines each). **Step 4:** PASS. **Step 5:** Commit `feat: host/taskgroup/globalparam tools`.

### Task 7: Read-only resource tools (custom scripts, date lists, PGP keys, SSH keys)

**Files:**
- Create: `src/tools/customscripts.ts`, `src/tools/datelists.ts`, `src/tools/pgpkeys.ts`, `src/tools/sshkeys.ts`
- Test: `tests/tools/keyed-resources.test.ts`

**Interfaces:**
- Same register pattern as Task 6. Tools: `moveit_list_custom_scripts`/`moveit_get_custom_script` (`{customScriptId}`), `moveit_list_date_lists`/`moveit_get_date_list` (`{dateListId}`), `moveit_list_pgp_keys` (uid search)/`moveit_get_pgp_key` (`{pGPKeyId}`), `moveit_list_ssh_keys`/`moveit_get_ssh_key` (`{sshKeyId}`).

- [ ] **Step 1: Failing tests:** same harness as Task 6; PGP list pins that `uid` (not `name`) is sent as query key.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: scripts/datelists/pgp/ssh tools`.

### Task 8: Task lifecycle + scheduler tools

**Files:**
- Create: `src/tools/tasks.ts`
- Test: `tests/tools/tasks.test.ts`

**Interfaces:**
- Consumes: client (Task 4). Produces `registerMoveitTasks(server, client): void`.
- Tools: `moveit_list_tasks` (`ListParamsSchema`), `moveit_get_task` (`{taskId}`), `moveit_list_running_tasks` (no input), `moveit_start_task` (`{taskId: z.string(), parameters: z.record(z.string()).optional()}` — description states it starts a run on the server), `moveit_stop_task` (`{taskId}`, description states it stops a running task), `moveit_set_scheduler` (`{action: z.enum(["start","stop"])}`).

- [ ] **Step 1: Failing tests:** start posts to `/tasks/{id}/start` with JSON body when parameters given, `{}` otherwise; stop posts `/tasks/{id}/stop`; scheduler PUT path; running-tasks hits `/tasks/running`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: task start/stop/scheduler tools`.

### Task 9: Report tools

**Files:**
- Create: `src/tools/reports.ts`
- Test: `tests/tools/reports.test.ts`

**Interfaces:**
- Produces `registerMoveitReports(server, client): void`. Tools: `moveit_audit_report`, `moveit_file_activity_report`, `moveit_task_runs_report` — each input `ReportQuerySchema`. Descriptions include the documented UI-equivalent predicates (`Status=="Failure"` + `!LogTime`, `StatusCode=out=("5000","5010")` + `!LogStamp`, `Status=in=("Success","Failure")` + `!StartTime`) so models can construct sensible queries.

- [ ] **Step 1: Failing tests:** each tool routes to its `/api/v1/reports/*` path; predicate with embedded quotes round-trips in the JSON body; tool result text parses back to the report fixture.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS. **Step 5:** Commit `feat: audit/fileactivity/taskruns report tools`.

### Task 10: Server entrypoint

**Files:**
- Modify: `src/index.ts`
- Test: `tests/entrypoint.test.ts`

**Interfaces:**
- Consumes: everything above. Produces exported `createServer(cfg: Config): { server: McpServer; client: MoveitClient; shutdown(): Promise<void> }` and exported `runMain(env)` / `main()` that loads env, creates the server, connects `StdioServerTransport`, and calls `shutdown()` (token revoke) on SIGINT/SIGTERM.

- [ ] **Step 1: Failing tests:** `createServer` registers all 24 tools (`server.server.listTools()` length pinned = 24, all `moveit_`-prefixed); missing env in `runMain` → throws `ConfigError` with aggregated message before any transport connect; `shutdown()` calls `tokenManager.revoke()` exactly once.
- [ ] **Step 2:** FAIL. **Step 3:** Implement entrypoint; logging to stderr only (stdout is the MCP channel). **Step 4:** PASS, plus `npm run build` → `dist/index.js` exists with node shebang. **Step 5:** Commit `feat: stdio MCP server entrypoint`.

### Task 11: End-to-end smoke against a fake MOVEit

**Files:**
- Test: `tests/e2e.test.ts`
- Create: `tests/fake-moveit.ts` (node:http server stub: `/api/v1/token`, `/api/v1/info`, `/api/v1/tasks`)

**Interfaces:**
- Consumes: full real stack (config → client → server) over stdio via SDK `StdioClientTransport` spawning `tsx src/index.ts` with fake-server env.

- [ ] **Step 1: Failing test:** spawn server via `StdioClientTransport`; `listTools()` → 24; `callTool("moveit_get_info")` → fake server's version payload; `callTool("moveit_list_tasks")` → fixture tasks; fake server asserts a bearer token arrived.
- [ ] **Step 2:** FAIL. **Step 3:** Only test code + fake server — fix product code if the test exposes wiring bugs (report any product change in the commit message). **Step 4:** PASS; `npm test`, `npm run lint`, `npm run build` all green. **Step 5:** Commit `test: e2e stdio smoke against fake MOVEit`.

### Task 12: README + example config

**Files:**
- Create: `README.md`; Modify: `.env.example`

- [ ] **Step 1:** README: env-var table, MCP client config snippet (`command: node dist/index.js`, env block), tool inventory (24 rows), security note (creds via env, TLS flag, token revocation on shutdown), out-of-scope list. `.env.example` mirrors Task 2 vars.
- [ ] **Step 2:** `npm test && npm run lint` green. **Step 3:** Commit `docs: README and env example`.
