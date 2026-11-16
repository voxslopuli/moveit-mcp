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
}
