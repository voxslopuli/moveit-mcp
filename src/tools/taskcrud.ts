import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';
import type { MoveitClient } from '../client.js';
import { jsonResult } from './util.js';

const NonEmptyRecord = z
  .record(z.string(), z.unknown())
  .refine((o) => Object.keys(o).length > 0, 'must be a non-empty object');

export function registerMoveitTaskCrud(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_create_task',
    {
      description:
        'Create a new traditional task from a Task model JSON. Tip: model the JSON on a moveit_get_task result for a similar task.',
      inputSchema: z.object({ task: NonEmptyRecord }),
    },
    async ({ task }) => jsonResult(await client.createTask(task)),
  );

  server.registerTool(
    'moveit_update_task',
    {
      description:
        'Replace a task with the given Task model JSON (full replacement, not a merge).',
      inputSchema: z.object({
        taskId: z.string().min(1),
        task: NonEmptyRecord,
      }),
    },
    async ({ taskId, task }) =>
      jsonResult(await client.updateTask(taskId, task)),
  );

  server.registerTool(
    'moveit_delete_task',
    {
      description: 'Delete a task permanently (destructive, no undo).',
      inputSchema: z.object({ taskId: z.string().min(1) }),
    },
    async ({ taskId }) => {
      await client.deleteTask(taskId);
      return jsonResult({ deleted: taskId });
    },
  );
}
