# moveit-mcp

MCP server for MOVEit Automation REST API over stdio.

## Configuration

| Variable                         | Required | Description                                                                                              |
| -------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `MOVEIT_BASE_URL`                | yes      | MOVEit Automation Web Admin base URL, including `/webadmin` (e.g. `https://moveit.example.com/webadmin`) |
| `MOVEIT_USERNAME`                | yes      | MOVEit account username                                                                                  |
| `MOVEIT_PASSWORD`                | yes      | MOVEit account password                                                                                  |
| `MOVEIT_SERVER_HOST`             | no       | Server hostname when different from the base URL host                                                    |
| `MOVEIT_TLS_REJECT_UNAUTHORIZED` | no       | Set `"false"` to accept self-signed certificates (default `true`)                                        |

Missing required variables fail startup with a list of what is missing. See `.env.example`.

## MCP client config

```json
{
  "mcpServers": {
    "moveit": {
      "command": "node",
      "args": ["dist/index.js"],
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

For development, use `"command": "npx", "args": ["tsx", "src/index.ts"]`.

## Tools

| Tool                            | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `moveit_get_info`               | Server version and info.                                                                     |
| `moveit_list_hosts`             | List configured hosts.                                                                       |
| `moveit_get_host`               | Get one host by ID.                                                                          |
| `moveit_list_task_groups`       | List task groups.                                                                            |
| `moveit_get_task_group`         | Get one task group by ID.                                                                    |
| `moveit_list_global_parameters` | List global parameters.                                                                      |
| `moveit_get_global_parameter`   | Get one global parameter by name.                                                            |
| `moveit_list_custom_scripts`    | List custom scripts.                                                                         |
| `moveit_get_custom_script`      | Get one custom script by ID.                                                                 |
| `moveit_list_date_lists`        | List date lists.                                                                             |
| `moveit_get_date_list`          | Get one date list by name.                                                                   |
| `moveit_list_pgp_keys`          | List PGP keys.                                                                               |
| `moveit_get_pgp_key`            | Get one PGP key by ID.                                                                       |
| `moveit_list_ssh_keys`          | List SSH keys.                                                                               |
| `moveit_get_ssh_key`            | Get one SSH key by ID.                                                                       |
| `moveit_list_tasks`             | List tasks.                                                                                  |
| `moveit_get_task`               | Get one task by ID.                                                                          |
| `moveit_list_running_tasks`     | List currently running task runs.                                                            |
| `moveit_start_task`             | Start a task (mutating).                                                                     |
| `moveit_stop_task`              | Stop a running task (mutating).                                                              |
| `moveit_set_scheduler`          | Enable/disable task scheduling (mutating).                                                   |
| `moveit_audit_report`           | Audit report — same predicate as Web Admin audit view: `Status=="Failure"` and no `LogTime`. |
| `moveit_file_activity_report`   | File activity report — `StatusCode out ("5000","5010")` and no `LogStamp`.                   |
| `moveit_task_runs_report`       | Task runs report — `Status in ("Success","Failure")` and no `StartTime`.                     |

## Security

- Credentials are read from environment variables only; never passed as tool arguments.
- Access/refresh tokens are never logged or echoed in tool output.
- Token lifecycle: ~15 min access token, ~30 min refresh token; refresh is automatic and transparent.
- Tokens are revoked on `SIGINT`/`SIGTERM` shutdown.
- Set `MOVEIT_TLS_REJECT_UNAUTHORIZED=false` only for hosts with self-signed certificates.

## Out of scope (v1)

- Config export/import (`GET`/`PUT /api/v1/config`)
- Task create/update/delete

## Development

Scripts: `npm run dev`, `npm run build`, `npm test`, `npm run lint`, `npm run format`.

Stack: tsup (build), tsx (dev), vitest (tests), biome (lint/format), husky + lint-staged (pre-commit).
