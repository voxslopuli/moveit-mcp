# @voxslopuli/moveit-mcp

MCP server exposing the MOVEit Automation REST API over stdio — 24 tools for browsing configuration, controlling tasks and the scheduler, and running audit, file-activity, and task-runs reports.

[![CI](https://github.com/voxslopuli/moveit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/voxslopuli/moveit-mcp/actions)
[![npm](https://img.shields.io/npm/v/@voxslopuli/moveit-mcp)](https://www.npmjs.com/package/@voxslopuli/moveit-mcp)

## Features

- 24 tools covering the MOVEit Automation REST API (`/api/v1`)
- Browse configuration objects: hosts, task groups, global parameters, custom scripts, date lists, PGP keys, SSH keys, tasks
- Control task execution and scheduler: start/stop task runs (with optional task parameters), enable/disable the global scheduler
- Web Admin-equivalent reports: audit (failed transfers), file activity (file/folder errors), task runs (completed runs)
- OAuth token lifecycle handled transparently: automatic refresh, revocation on shutdown
- Strict TLS by default; opt-out flag for self-signed certificates

## Requirements

- Node.js >= 20
- MOVEit Automation with the Web Admin REST API reachable over HTTPS
- A MOVEit account with API access enabled

## Installation

From npm (no clone needed):

```sh
npx -y @voxslopuli/moveit-mcp
```

From source:

```sh
git clone https://github.com/voxslopuli/moveit-mcp
cd moveit-mcp
npm ci
npm run build
```

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable                         | Required | Default | Description                                                                     |
| -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------- |
| `MOVEIT_BASE_URL`                | yes      | —       | Web Admin base URL, **including the `/webadmin` suffix**                        |
| `MOVEIT_USERNAME`                | yes      | —       | MOVEit account username                                                         |
| `MOVEIT_PASSWORD`                | yes      | —       | MOVEit account password                                                         |
| `MOVEIT_SERVER_HOST`             | no       | —       | Server hostname sent in the token request when different from the base URL host |
| `MOVEIT_TLS_REJECT_UNAUTHORIZED` | no       | `true`  | Set `"false"` to accept self-signed certificates                                |

Missing required variables fail startup with a list of what is missing.

### Security notes

- Credentials come from environment variables only; never passed as tool arguments.
- Access/refresh tokens are never logged or echoed in tool output or error messages.
- Token lifecycle: ~15 min access token, ~30 min refresh token; refresh is automatic.
- Tokens are revoked on `SIGINT`/`SIGTERM` shutdown.
- Set `MOVEIT_TLS_REJECT_UNAUTHORIZED=false` only for self-signed certificates in non-production environments.

## Client setup

### OpenCode

Add the server to `~/.config/opencode/opencode.json` (global) or `.opencode/opencode.json` (project):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "moveit-mcp": {
        "type": "local",
        "command": ["npx", "-y", "@voxslopuli/moveit-mcp"],
        "environment": {
          "MOVEIT_BASE_URL": "https://moveit.example.com/webadmin",
          "MOVEIT_USERNAME": "svc-account",
          "MOVEIT_PASSWORD": "changeme",
          "MOVEIT_TLS_REJECT_UNAUTHORIZED": "true"
        }
      }
    }
  }
}
```

Verify the connection with `opencode mcp list`. Set `"disabled": true` on a server to keep it configured without connecting.

### Other clients

`claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "moveit": {
      "command": "npx",
      "args": ["-y", "@voxslopuli/moveit-mcp"],
      "env": {
        "MOVEIT_BASE_URL": "https://moveit.example.com/webadmin",
        "MOVEIT_USERNAME": "svc-account",
        "MOVEIT_PASSWORD": "changeme",
        "MOVEIT_TLS_REJECT_UNAUTHORIZED": "true"
      }
    }
  }
}
```

Generic MCP client — any client that supports `mcpServers`:

```json
{
  "mcpServers": {
    "moveit": {
      "command": "npx",
      "args": ["-y", "@voxslopuli/moveit-mcp"],
      "env": {
        "MOVEIT_BASE_URL": "https://moveit.example.com/webadmin",
        "MOVEIT_USERNAME": "svc-account",
        "MOVEIT_PASSWORD": "changeme",
        "MOVEIT_SERVER_HOST": "",
        "MOVEIT_TLS_REJECT_UNAUTHORIZED": "true"
      }
    }
  }
}
```

> **`MOVEIT_BASE_URL` must include the `/webadmin` suffix** — the REST API lives under `https://<host>/webadmin/api/v1/`. A bare host URL like `https://moveit.example.com` will fail authentication.

## Tool reference

Pagination tools accept `page`, `perPage`, `fields`, and (where noted) a `name`/`uid` filter — all optional.

### Info

| Tool              | Input | Description                            |
| ----------------- | ----- | -------------------------------------- |
| `moveit_get_info` | none  | Server info including product version. |

### Hosts

| Tool                | Input                                                                                                                                       | Description                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `moveit_list_hosts` | pagination, `fields`, `name`, optional `type` (`FileSystem`, `FTP`, `POP3`, `Share`, `siLock`, `SMTP`, `SSHFTP`, `AS1`, `AS2`, `AS3`, `S3`) | List hosts.                     |
| `moveit_get_host`   | `hostId`                                                                                                                                    | Get one host by ID (host name). |

### Task Groups

| Tool                      | Input                        | Description                 |
| ------------------------- | ---------------------------- | --------------------------- |
| `moveit_list_task_groups` | pagination, `fields`, `name` | List task groups.           |
| `moveit_get_task_group`   | `taskGroupName`              | Get one task group by name. |

### Global Parameters

| Tool                            | Input                        | Description                                    |
| ------------------------------- | ---------------------------- | ---------------------------------------------- |
| `moveit_list_global_parameters` | pagination, `fields`, `name` | List MOVEit Transfer global system parameters. |
| `moveit_get_global_parameter`   | `name`                       | Get one global parameter by exact name.        |

### Custom Scripts

| Tool                         | Input                        | Description                                |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| `moveit_list_custom_scripts` | pagination, `fields`, `name` | List custom scripts.                       |
| `moveit_get_custom_script`   | `customScriptId`             | Get one custom script by ID (script name). |

### Date Lists

| Tool                     | Input                        | Description                                                       |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `moveit_list_date_lists` | pagination, `fields`, `name` | List date lists (named date collections for schedule conditions). |
| `moveit_get_date_list`   | `dateListId`                 | Get one date list by ID (list name).                              |

### PGP Keys

| Tool                   | Input                                              | Description            |
| ---------------------- | -------------------------------------------------- | ---------------------- |
| `moveit_list_pgp_keys` | `page`, `perPage`, `fields`, optional `uid` filter | List OpenPGP keys.     |
| `moveit_get_pgp_key`   | `pGPKeyId`                                         | Get one PGP key by ID. |

### SSH Keys

| Tool                   | Input                        | Description                       |
| ---------------------- | ---------------------------- | --------------------------------- |
| `moveit_list_ssh_keys` | pagination, `fields`, `name` | List SSH client keys.             |
| `moveit_get_ssh_key`   | `sshKeyId`                   | Get one SSH key by ID (key name). |

### Tasks

| Tool                        | Input                                                    | Description                                        |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `moveit_list_tasks`         | pagination, `fields`, `name` search                      | List tasks.                                        |
| `moveit_get_task`           | `taskId`                                                 | Get one task by ID.                                |
| `moveit_list_running_tasks` | none                                                     | List currently running task runs.                  |
| `moveit_start_task` ⚠️      | `taskId`, optional `parameters` (string key/value pairs) | **Mutating:** start a run of a task on the server. |
| `moveit_stop_task` ⚠️       | `taskId`                                                 | **Mutating:** stop a running task.                 |
| `moveit_set_scheduler` ⚠️   | `action`: `"start"` or `"stop"`                          | **Mutating:** start or stop the global scheduler.  |

### Reports

All report tools take `predicate` (required), optional `orderBy`, optional `maxCount` (positive integer, max 10000).

| Tool                          | Input                              | Description                                                                                                           |
| ----------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `moveit_audit_report`         | `predicate`, `orderBy`, `maxCount` | Audit report. Web Admin failed-transfers view: `Status=="Failure"` with `orderBy: "!LogTime"`                         |
| `moveit_file_activity_report` | `predicate`, `orderBy`, `maxCount` | File activity report. Web Admin file/folder errors view: `StatusCode=out=("5000","5010")` with `orderBy: "!LogStamp"` |
| `moveit_task_runs_report`     | `predicate`, `orderBy`, `maxCount` | Task runs report. Completed runs of both outcomes: `Status=in=("Success","Failure")` with `orderBy: "!StartTime"`     |

Example:

```json
{
  "predicate": "Status==\"Failure\"",
  "orderBy": "!LogTime",
  "maxCount": 100
}
```

#### Predicate language

- Combining: `;` or `and` for AND, `,` or `or` for OR.
- Operators: `==`, `!=`, `=lt=` (`<`), `=le=` (`<=`), `=gt=` (`>`), `=ge=` (`>=`), `=in=`, `=out=`, `=like=`.
- `=like=` supports `%` (any string) and `_` (any single character) wildcards.
- String values are quoted; `=in=`/`=out=` take a parenthesized, comma-separated list of quoted values, e.g. `Status=in=("Success","Failure")`.
- A leading `!` in `orderBy` values sorts descending (`!LogTime` = newest first).

## Out of scope (v1)

- Configuration export/import (`GET`/`PUT /api/v1/config`)
- Task create/update/delete

## Troubleshooting

- **Missing environment variables** — startup fails with a list naming exactly which required variables are missing.
- **401 loops** — usually wrong credentials, or `MOVEIT_BASE_URL` missing the `/webadmin` suffix while `MOVEIT_SERVER_HOST` diverges from the base URL host. Verify all three.
- **Self-signed certificate errors** — set `MOVEIT_TLS_REJECT_UNAUTHORIZED=false` (non-production only).
- **HTTP 422 on reports** — invalid `page`/`perPage` combinations or out-of-range `maxCount`; both must be positive integers (`maxCount` ≤ 10000).

## Development

| Script           | Description                  |
| ---------------- | ---------------------------- |
| `npm run dev`    | Run from source via tsx.     |
| `npm run build`  | Build to `dist/` via tsup.   |
| `npm test`       | Run vitest suite.            |
| `npm run lint`   | Biome check (lint + format). |
| `npm run format` | Biome check with auto-fix.   |

Stack: TypeScript (ESM), `@modelcontextprotocol/server`, zod, tsup, tsx, vitest, Biome, husky + lint-staged.

Workflow is test-driven: write the failing test (red), implement minimally (green), refactor. Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, ...). Coverage: `npx vitest --coverage`.

## License

[MIT](https://github.com/voxslopuli/moveit-mcp/blob/main/LICENSE)
