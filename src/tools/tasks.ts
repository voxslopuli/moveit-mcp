import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { ListParamsSchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitTasks(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_list_tasks',
    {
      description:
        'List MOVEit Automation tasks with optional name search, field selection, and pagination.',
      inputSchema: ListParamsSchema,
    },
    async (args) => jsonResult(await client.list('tasks', args)),
  );

  server.registerTool(
    'moveit_get_task',
    {
      description: 'Get a single MOVEit Automation task by its task ID.',
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async ({ taskId }) => jsonResult(await client.get('tasks', taskId)),
  );

  server.registerTool(
    'moveit_list_running_tasks',
    {
      description: 'List currently running MOVEit Automation task runs.',
      inputSchema: z.object({}),
    },
    async () => jsonResult(await client.runningTasks()),
  );

  server.registerTool(
    'moveit_start_task',
    {
      description:
        'Start a run of a MOVEit Automation task on the server (mutating action). Optionally accepts task parameters as string key/value pairs.',
      inputSchema: z.object({
        taskId: z.string().min(1),
        parameters: z.record(z.string(), z.string()).optional(),
      }),
    },
    async ({ taskId, parameters }) =>
      jsonResult(await client.startTask(taskId, parameters)),
  );

  server.registerTool(
    'moveit_stop_task',
    {
      description:
        'Stop a running MOVEit Automation task on the server (mutating action).',
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async ({ taskId }) => jsonResult(await client.stopTask(taskId)),
  );

  server.registerTool(
    'moveit_set_scheduler',
    {
      description:
        'Start or stop the global MOVEit Automation scheduler on the server (mutating action).',
      inputSchema: z.object({ action: z.enum(['start', 'stop']) }),
    },
    async ({ action }) => {
      await client.setScheduler(action);
      return jsonResult({ scheduler: action });
    },
  );
  server.registerTool(
    'moveit_list_task_logs',
    {
      description:
        'List log entries (runs) for a MOVEit Automation task, with optional name filter, field selection, and pagination. Requires MOVEit Automation 2019.1+ (404 on older servers).',
      inputSchema: z.object({
        taskId: z.string().min(1),
        name: z.string().optional(),
        fields: z.string().optional(),
        page: z.number().int().positive().optional(),
        perPage: z.number().int().positive().optional(),
      }),
    },
    async (args) => {
      const { taskId, ...params } = args;
      const hasParams = Object.values(params).some((v) => v !== undefined);
      return jsonResult(
        await client.listTaskLogs(taskId, hasParams ? params : undefined),
      );
    },
  );

  server.registerTool(
    'moveit_get_task_log',
    {
      description:
        'Get a single log entry for a MOVEit Automation task by task ID and task log ID. Requires MOVEit Automation 2019.1+ (404 on older servers).',
      inputSchema: z.object({
        taskId: z.string().min(1),
        taskLogId: z.string().min(1),
      }),
    },
    async ({ taskId, taskLogId }) =>
      jsonResult(await client.getTaskLog(taskId, taskLogId)),
  );

  server.registerTool(
    'moveit_kill_task',
    {
      description:
        'Force-kill a running task (2024.1+); use moveit_stop_task for graceful stop. Mutating action.',
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async ({ taskId }) => jsonResult(await client.killTask(taskId)),
  );

  server.registerTool(
    'moveit_get_scheduler_status',
    {
      description:
        'Get the current status of the global MOVEit Automation scheduler (running or stopped). Requires MOVEit Automation 2020.1+ (404 on older servers).',
      inputSchema: z.object({}),
    },
    async () => jsonResult(await client.getSchedulerStatus()),
  );
}
