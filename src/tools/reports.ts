import type { McpServer } from '@modelcontextprotocol/server';
import type { MoveitClient } from '../client.js';
import { ReportQuerySchema } from '../schemas.js';
import { jsonResult } from './util.js';

export function registerMoveitReports(
  server: McpServer,
  client: MoveitClient,
): void {
  server.registerTool(
    'moveit_audit_report',
    {
      description:
        'Run a MOVEit Automation audit report. For Web Admin-style failed-transfer results, use predicate `Status=="Failure"` with orderBy `!LogTime` (newest failures first).',
      inputSchema: ReportQuerySchema,
    },
    async (args) => jsonResult(await client.report('audit', args)),
  );

  server.registerTool(
    'moveit_file_activity_report',
    {
      description:
        'Run a MOVEit Automation file activity report. For Web Admin-style file/folder errors, use predicate `StatusCode=out=("5000","5010")` with orderBy `!LogStamp` (newest first).',
      inputSchema: ReportQuerySchema,
    },
    async (args) => jsonResult(await client.report('fileactivity', args)),
  );

  server.registerTool(
    'moveit_task_runs_report',
    {
      description:
        'Run a MOVEit Automation task runs report. For completed runs of both outcomes, use predicate `Status=in=("Success","Failure")` with orderBy `!StartTime` (newest first).',
      inputSchema: ReportQuerySchema,
    },
    async (args) => jsonResult(await client.report('taskruns', args)),
  );
}
