# @voxslopuli/moveit-mcp

MCP server exposing the MOVEit Automation REST API over stdio — 52 tools across 6 groups for browsing configuration, controlling tasks and the scheduler, running audit, file-activity, and task-runs reports, and editing tasks and the configuration.

[![CI](https://github.com/voxslopuli/moveit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/voxslopuli/moveit-mcp/actions)
[![npm](https://img.shields.io/npm/v/@voxslopuli/moveit-mcp)](https://www.npmjs.com/package/@voxslopuli/moveit-mcp)

## Features

- 52 tools across 6 groups covering the MOVEit Automation REST API (`/api/v1`), targets 2018–2024.1
- Only 21 tools visible by default (info, tasks, reports, meta); other groups are enabled on demand via meta tools
- Browse configuration objects: hosts, task groups, resource groups, global parameters, custom scripts, date lists, PGP keys, SSH keys, SSL certificates, standard scripts, tasks
- Control task execution and scheduler: start/stop task runs (with optional task parameters), force-kill (2024.1+), enable/disable the global scheduler
- Edit tasks and configuration: create/update/delete tasks, export/import the full configuration incl. the v2 passphrase-encrypted XML API (config import = full overwrite)
- Web Admin-equivalent reports: audit (failed transfers), file activity (file/folder errors), task runs (completed runs), plus report export
- Resource group ACL management: read, add, update, delete ACL entries (2019.1+)
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

| Variable                         | Required | Default | Description                                                                                                                                                                             |
| -------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MOVEIT_BASE_URL`                | yes      | —       | Server root **without** `/api/v1` — e.g. `https://moveit.example.com` (API at host root) or `https://host/webadmin` (Web Admin-served). A trailing `/api/v1` is tolerated and stripped. |
| `MOVEIT_USERNAME`                | yes      | —       | MOVEit account username                                                                                                                                                                 |
| `MOVEIT_PASSWORD`                | yes      | —       | MOVEit account password                                                                                                                                                                 |
| `MOVEIT_SERVER_HOST`             | no       | —       | Server hostname sent in the token request when different from the base URL host                                                                                                         |
| `MOVEIT_TLS_REJECT_UNAUTHORIZED` | no       | `true`  | Set `"false"` to accept self-signed certificates                                                                                                                                        |

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
          "MOVEIT_BASE_URL": "https://moveit.example.com",
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
        "MOVEIT_BASE_URL": "https://moveit.example.com",
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
        "MOVEIT_BASE_URL": "https://moveit.example.com",
        "MOVEIT_USERNAME": "svc-account",
        "MOVEIT_PASSWORD": "changeme",
        "MOVEIT_SERVER_HOST": "",
        "MOVEIT_TLS_REJECT_UNAUTHORIZED": "true"
      }
    }
  }
}
```

> **`MOVEIT_BASE_URL` is the server root WITHOUT `/api/v1`** — deployments serve the API at different roots: some at `https://<host>/api/v1` (set `https://moveit.cnyric.org`), others under Web Admin at `https://<host>/webadmin/api/v1` (set `https://host/webadmin`). A trailing `/api/v1` is tolerated and stripped automatically.

## Tool groups

The default advertised surface is deliberately small: **21 tools** (the `info`, `tasks`, `reports`, and `meta` groups). The remaining groups — `config`, `resources`, `access` — are registered but hidden until enabled. Small tool lists keep tool selection reliable.

| Group       | Tools | Enabled by default | Minimum server version                                               |
| ----------- | ----- | ------------------ | -------------------------------------------------------------------- |
| `info`      | 1     | yes                | —                                                                    |
| `meta`      | 3     | yes                | —                                                                    |
| `tasks`     | 13    | yes                | 2018 (task logs 2019.1, `kill_task` 2024.1, scheduler status 2020.1) |
| `reports`   | 4     | yes                | 2018 (report export 2019.1)                                          |
| `config`    | 4     | no                 | 2018 (config v2 2019.1+)                                             |
| `resources` | 20    | no                 | 2018 (SSL certs, standard scripts, resource groups 2019.1)           |
| `access`    | 7     | no                 | 2019.1                                                               |

Discover and enable groups with the always-available meta tools. A typical conversation:

> **User:** What groups does this server have?
> **Assistant:** (calls `moveit_tools_list`) Six groups: info, tasks, reports, and meta are enabled; config, resources, and access are hidden.
> **User:** I need to manage hosts and task groups.
> **Assistant:** _(calls `moveit_tools_enable` with `groups: ["resources"]`)_ Done — the 20 resources tools are now available.

Notes:

- Enabling or disabling a group sends a tool-list-changed notification; the group's tools immediately appear in (or disappear from) the client's tool list.
- Tools that target newer REST endpoints (e.g. `moveit_kill_task` on 2024.1) return 404 on older servers. That 404 is expected for the server's version and is surfaced as a tool error.
- Only `info` cannot be disabled; every other group can be toggled back off.

## Tool reference

Pagination tools accept `page`, `perPage`, `fields`, and (where noted) a `name`/`uid` filter — all optional.

> **Dangerous operations:** `moveit_put_config` (full config overwrite), `moveit_import_config_v2` (full config overwrite), `moveit_update_task` (full task replacement), and `moveit_delete_task` are destructive — get the current object before writing; there is no undo.

### Meta (always available)

| Tool                   | Input            | Description                                                                          |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `moveit_tools_list`    | none             | List tool groups with description, enabled flag, and tool names.                     |
| `moveit_tools_enable`  | `groups` (array) | Enable one or more groups, making their tools visible to the client.                 |
| `moveit_tools_disable` | `groups` (array) | Disable one or more groups (hides their tools). The `info` group cannot be disabled. |

### Info (always available)

| Tool              | Input | Description                            |
| ----------------- | ----- | -------------------------------------- |
| `moveit_get_info` | none  | Server info including product version. |

### Tasks (enabled by default; 2018)

| Tool                          | Input                                                    | Description                                                                                  |
| ----------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `moveit_list_tasks`           | pagination, `fields`, `name` search                      | List tasks.                                                                                  |
| `moveit_get_task`             | `taskId`                                                 | Get one task by ID.                                                                          |
| `moveit_list_running_tasks`   | none                                                     | List currently running task runs.                                                            |
| `moveit_start_task` ⚠️        | `taskId`, optional `parameters` (string key/value pairs) | **Mutating:** start a run of a task on the server.                                           |
| `moveit_stop_task` ⚠️         | `taskId`                                                 | **Mutating:** stop a running task gracefully.                                                |
| `moveit_set_scheduler` ⚠️     | `action`: `"start"` or `"stop"`                          | **Mutating:** start or stop the global scheduler.                                            |
| `moveit_list_task_logs`       | `taskId`, pagination, `fields`, `name`                   | List log entries (runs) for a task. Requires 2019.1+ (404 on older servers).                 |
| `moveit_get_task_log`         | `taskId`, `taskLogId`                                    | Get one task log entry. Requires 2019.1+ (404 on older servers).                             |
| `moveit_kill_task` ⚠️         | `taskId`                                                 | **Mutating:** force-kill a running task (2024.1+); use `moveit_stop_task` for graceful stop. |
| `moveit_get_scheduler_status` | none                                                     | Get global scheduler status (running/stopped). Requires 2020.1+ (404 on older servers).      |

#### Task CRUD

| Tool                    | Input                              | Description                                                      |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `moveit_create_task`    | `task` (Task model JSON)           | Create a new traditional task.                                   |
| `moveit_update_task` ⚠️ | `taskId`, `task` (Task model JSON) | **DESTRUCTIVE:** replace a task — full replacement, not a merge. |
| `moveit_delete_task` ⚠️ | `taskId`                           | **DESTRUCTIVE:** delete a task permanently.                      |

### Reports (enabled by default; 2018)

All report tools take `predicate` (required), optional `orderBy`, optional `maxCount` (positive integer, max 10000). MOVEit accepts single-quoted strings in predicates, e.g. `Status=in=('Success','Failure')`, which is convenient when embedding in JSON bodies.

| Tool                          | Input                                                                            | Description                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moveit_audit_report`         | `predicate`, `orderBy`, `maxCount`                                               | Audit report. Web Admin failed-transfers view: `Status=="Failure"` with `orderBy: "!LogTime"`                                                                           |
| `moveit_file_activity_report` | `predicate`, `orderBy`, `maxCount`                                               | File activity report. Web Admin file/folder errors view: `StatusCode=out=("5000","5010")` with `orderBy: "!LogStamp"`                                                   |
| `moveit_task_runs_report`     | `predicate`, `orderBy`, `maxCount`                                               | Task runs report. Completed runs of both outcomes: `Status=in=("Success","Failure")` with `orderBy: "!StartTime"`                                                       |
| `moveit_export_report`        | `kind` (`audit`, `fileactivity`, `taskruns`), `predicate`, `orderBy`, `maxCount` | Export a report using the same query as the inline report tools. Requires 2019.1+ (404 on older servers). Returns an exported report reference rather than inline data. |

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
- String values are quoted; `=in=`/`=out=` take a parenthesized, comma-separated list of quoted values, e.g. `Status=in=("Success","Failure")`. MOVEit also accepts single quotes in predicates, e.g. `Status=in=('Success','Failure')`, which is convenient when embedding the predicate in a JSON body.
- A leading `!` in `orderBy` values sorts descending (`!LogTime` = newest first).

### Config (hidden by default; 2018)

| Tool                         | Input                             | Description                                                                                                                                                                 |
| ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `moveit_get_config` 🔒       | none                              | Export the full configuration (`AdminConfigModel`). Admin-only read. Deprecated server-key export — prefer `moveit_export_config_v2`.                                       |
| `moveit_put_config` ⚠️       | `config` (AdminConfigModel)       | **DESTRUCTIVE:** import (full overwrite) of the entire configuration. Get first, modify, then import.                                                                       |
| `moveit_export_config_v2`    | `passphrase` xor `sanitize: true` | Export the configuration as XML (v2 API, 2019.1+). Encrypted-with-passphrase (portable, secrets encrypted) or sanitized (secrets removed).                                  |
| `moveit_import_config_v2` ⚠️ | `configXML`, `passphrase`         | **DESTRUCTIVE:** import (full overwrite) a configuration XML (2019.1+). Pair with `moveit_export_config_v2` using a passphrase so encrypted secrets survive the round-trip. |

### Resources (hidden by default; 2018)

#### Hosts

| Tool                | Input                                                                                                                                       | Description                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `moveit_list_hosts` | pagination, `fields`, `name`, optional `type` (`FileSystem`, `FTP`, `POP3`, `Share`, `siLock`, `SMTP`, `SSHFTP`, `AS1`, `AS2`, `AS3`, `S3`) | List hosts.                     |
| `moveit_get_host`   | `hostId`                                                                                                                                    | Get one host by ID (host name). |

#### Task Groups (deprecated)

Task groups are a deprecated MOVEit Automation concept; kept for older servers.

| Tool                      | Input                        | Description                 |
| ------------------------- | ---------------------------- | --------------------------- |
| `moveit_list_task_groups` | pagination, `fields`, `name` | List task groups.           |
| `moveit_get_task_group`   | `taskGroupName`              | Get one task group by name. |

#### Global Parameters

| Tool                            | Input                        | Description                                    |
| ------------------------------- | ---------------------------- | ---------------------------------------------- |
| `moveit_list_global_parameters` | pagination, `fields`, `name` | List MOVEit Transfer global system parameters. |
| `moveit_get_global_parameter`   | `name`                       | Get one global parameter by exact name.        |

#### Custom Scripts

| Tool                         | Input                        | Description                                |
| ---------------------------- | ---------------------------- | ------------------------------------------ |
| `moveit_list_custom_scripts` | pagination, `fields`, `name` | List custom scripts.                       |
| `moveit_get_custom_script`   | `customScriptId`             | Get one custom script by ID (script name). |

#### Date Lists

| Tool                     | Input                        | Description                                                       |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `moveit_list_date_lists` | pagination, `fields`, `name` | List date lists (named date collections for schedule conditions). |
| `moveit_get_date_list`   | `dateListId`                 | Get one date list by ID (list name).                              |

#### PGP Keys

| Tool                   | Input                                              | Description            |
| ---------------------- | -------------------------------------------------- | ---------------------- |
| `moveit_list_pgp_keys` | `page`, `perPage`, `fields`, optional `uid` filter | List OpenPGP keys.     |
| `moveit_get_pgp_key`   | `pGPKeyId`                                         | Get one PGP key by ID. |

#### SSH Keys

| Tool                   | Input                        | Description                       |
| ---------------------- | ---------------------------- | --------------------------------- |
| `moveit_list_ssh_keys` | pagination, `fields`, `name` | List SSH client keys.             |
| `moveit_get_ssh_key`   | `sshKeyId`                   | Get one SSH key by ID (key name). |

#### SSL Certificates (2019.1+)

| Tool                           | Input                        | Description                                  |
| ------------------------------ | ---------------------------- | -------------------------------------------- |
| `moveit_list_ssl_certificates` | pagination, `fields`, `name` | List SSL certificates.                       |
| `moveit_get_ssl_certificate`   | `thumbprint`                 | Get one SSL certificate by SHA-1 thumbprint. |

#### Standard Scripts (2019.1+)

| Tool                           | Input                        | Description                       |
| ------------------------------ | ---------------------------- | --------------------------------- |
| `moveit_list_standard_scripts` | pagination, `fields`, `name` | List standard (built-in) scripts. |
| `moveit_get_standard_script`   | `standardScriptId`           | Get one standard script by ID.    |

#### Resource Groups (2019.1+)

| Tool                          | Input                        | Description                     |
| ----------------------------- | ---------------------------- | ------------------------------- |
| `moveit_list_resource_groups` | pagination, `fields`, `name` | List resource groups.           |
| `moveit_get_resource_group`   | `resourceGroupName`          | Get one resource group by name. |

### Access (hidden by default; 2019.1)

#### User Groups

| Tool                      | Input                        | Description                 |
| ------------------------- | ---------------------------- | --------------------------- |
| `moveit_list_user_groups` | pagination, `fields`, `name` | List user groups.           |
| `moveit_get_user_group`   | `userGroupName`              | Get one user group by name. |

#### Resource Group ACLs

| Tool                   | Input                                  | Description                                                                  |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `moveit_list_acls`     | pagination                             | List ACL entries controlling resource group access.                          |
| `moveit_get_acl`       | `aclId`                                | Get one ACL entry by ID.                                                     |
| `moveit_add_acl` ⚠️    | `acl` (non-empty JSON object)          | **Mutating:** create an ACL entry granting a permission on a resource group. |
| `moveit_update_acl` ⚠️ | `aclId`, `acl` (non-empty JSON object) | **Mutating:** replace an existing ACL entry (overwrite, not a merge).        |
| `moveit_delete_acl` ⚠️ | `aclId`                                | **DESTRUCTIVE:** delete an ACL entry — removes the permission with no undo.  |

## Out of scope (v1)

- SSH key / PGP key write operations (import/delete) — read-only today
- Host management (create/update/delete hosts)
- Schedule CRUD (date lists are readable only)
- ASx host config editing (AS1/AS2/AS3 details beyond listing)

## Troubleshooting

- **Missing environment variables** — startup fails with a list naming exactly which required variables are missing.
- **401 loops** — usually wrong credentials, or `MOVEIT_BASE_URL` pointing at the wrong root (bare host for a Web Admin-served deployment, or `/webadmin` where the API lives at the host root) while `MOVEIT_SERVER_HOST` diverges from the base URL host. Verify all three.
- **Self-signed certificate errors** — set `MOVEIT_TLS_REJECT_UNAUTHORIZED=false` (non-production only).
- **HTTP 422 on reports** — invalid `page`/`perPage` combinations or out-of-range `maxCount`; both must be positive integers (`maxCount` ≤ 10000).
- **404 on newer-API tools** — tools targeting newer REST endpoints (`moveit_kill_task` 2024.1, task logs 2019.1, scheduler status 2020.1, report export 2019.1, config v2 2019.1, SSL certs / standard scripts / resource groups / ACLs 2019.1) return 404 on older servers. This is expected for the server's version and is surfaced as a tool error, not a bug.

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
