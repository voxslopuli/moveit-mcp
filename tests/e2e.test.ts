import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';
import { type FakeMoveit, startFakeMoveit } from './fake-moveit.js';

describe('stdio e2e smoke', () => {
  let fake: FakeMoveit;
  let client: Client;
  let transport: StdioClientTransport;

  afterEach(async () => {
    await client?.close();
    await fake.close();
    const { pid } = transport;
    if (typeof pid === 'number') {
      process.kill(pid, 'SIGTERM');
    }
  });

  it('lists default tools and serves info/tasks through the fake MOVEit API', async () => {
    fake = await startFakeMoveit();
    const childEnv: Record<string, string> = {
      MOVEIT_BASE_URL: `http://127.0.0.1:${fake.port}/webadmin`,
      MOVEIT_USERNAME: 'u',
      MOVEIT_PASSWORD: 'p',
    };
    for (const key of ['PATH', 'HOME'] as const) {
      const v = process.env[key];
      if (v) {
        childEnv[key] = v;
      }
    }
    transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/index.ts'],
      env: childEnv,
    });
    client = new Client({ name: 'e2e-client', version: '0.0.0' });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.length).toBe(21);

    const info = await client.callTool({ name: 'moveit_get_info' });
    const infoText = (info.content as Array<{ type: string; text: string }>)[0]
      .text;
    expect(JSON.parse(infoText)).toEqual({
      version: '2019.1.0',
      server: 'MOVEit Automation',
    });

    const tasks = await client.callTool({ name: 'moveit_list_tasks' });
    const tasksText = (
      tasks.content as Array<{ type: string; text: string }>
    )[0].text;
    const parsed = JSON.parse(tasksText) as {
      items: Array<{ ID: string; Name: string; Active: number }>;
    };
    expect(parsed.items).toEqual([
      { ID: '226676691', Name: '!TaylorImportTest', Active: 0 },
    ]);

    const created = await client.callTool({
      name: 'moveit_create_task',
      arguments: { task: { Name: 'new-task', Active: 0 } },
    });
    const createdText = (
      created.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(createdText)).toEqual({
      Name: 'new-task',
      Active: 0,
    });

    const updated = await client.callTool({
      name: 'moveit_update_task',
      arguments: {
        taskId: '226676691',
        task: { ID: '226676691', Name: 'renamed', Active: 1 },
      },
    });
    const updatedText = (
      updated.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(updatedText)).toEqual({
      ID: '226676691',
      Name: 'renamed',
      Active: 1,
    });

    const deleted = await client.callTool({
      name: 'moveit_delete_task',
      arguments: { taskId: '226676691' },
    });
    const deletedText = (
      deleted.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(deletedText)).toEqual({ deleted: '226676691' });

    // config tools are disabled by default; enable the group via meta tool
    const enableResult = await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['config'] },
    });
    const enableText = (
      enableResult.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(enableText)).toEqual({
      enabled: ['info', 'tasks', 'reports', 'config'],
      added: ['config'],
    });

    const config = await client.callTool({ name: 'moveit_get_config' });
    const configText = (
      config.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(configText)).toEqual({
      Settings: { adminEmail: 'admin@example.com' },
    });

    const exportedConfig = await client.callTool({
      name: 'moveit_export_config_v2',
      arguments: { passphrase: 'pw' },
    });
    const exportedConfigText = (
      exportedConfig.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(exportedConfigText)).toEqual({ configXML: '<config/>' });

    const importedConfig = await client.callTool({
      name: 'moveit_import_config_v2',
      arguments: { configXML: '<config/>', passphrase: 'pw' },
    });
    const importedConfigText = (
      importedConfig.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(importedConfigText)).toEqual({ imported: true });

    const taskLogs = await client.callTool({
      name: 'moveit_list_task_logs',
      arguments: { taskId: '226676691' },
    });
    const taskLogsText = (
      taskLogs.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(taskLogsText)).toEqual({
      paging: { page: 1, perPage: 25, total: 1 },
      items: [{ TaskLogID: '987', Name: 'log-entry-1' }],
    });

    const schedulerStatus = await client.callTool({
      name: 'moveit_get_scheduler_status',
    });
    const schedulerText = (
      schedulerStatus.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(schedulerText)).toEqual({ Status: 'Stopped' });

    const exported = await client.callTool({
      name: 'moveit_export_report',
      arguments: { kind: 'taskruns', predicate: 'Status=in=("Success")' },
    });
    const exportedText = (
      exported.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(exportedText)).toEqual({ ExportedReportID: 'export-1' });

    // resources and access groups are disabled by default; enable both
    const enableNew = await client.callTool({
      name: 'moveit_tools_enable',
      arguments: { groups: ['resources', 'access'] },
    });
    const enableNewText = (
      enableNew.content as Array<{ type: string; text: string }>
    )[0].text;
    expect(JSON.parse(enableNewText)).toEqual({
      enabled: ['info', 'tasks', 'reports', 'config', 'resources', 'access'],
      added: ['resources', 'access'],
    });
    expect((await client.listTools()).tools.length).toBe(52);

    const sslCerts = await client.callTool({
      name: 'moveit_list_ssl_certificates',
    });
    expect(
      JSON.parse(
        (sslCerts.content as Array<{ type: string; text: string }>)[0].text
      ).items
    ).toEqual([{ Thumbprint: 'AB12', Name: 'Root CA' }]);

    const cert = await client.callTool({
      name: 'moveit_get_ssl_certificate',
      arguments: { thumbprint: 'AB12' },
    });
    expect(
      JSON.parse(
        (cert.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      Thumbprint: 'AB12',
      Name: 'Root CA',
    });

    const scripts = await client.callTool({
      name: 'moveit_get_standard_script',
      arguments: { standardScriptId: 'pgp-encrypt' },
    });
    expect(
      JSON.parse(
        (scripts.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      Name: 'pgp-encrypt',
    });

    const userGroup = await client.callTool({
      name: 'moveit_get_user_group',
      arguments: { userGroupName: 'admins' },
    });
    expect(
      JSON.parse(
        (userGroup.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      Name: 'admins',
    });

    const resourceGroup = await client.callTool({
      name: 'moveit_get_resource_group',
      arguments: { resourceGroupName: 'reports' },
    });
    expect(
      JSON.parse(
        (resourceGroup.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      Name: 'reports',
    });

    const acls = await client.callTool({ name: 'moveit_list_acls' });
    expect(
      JSON.parse(
        (acls.content as Array<{ type: string; text: string }>)[0].text
      ).items
    ).toEqual([{ ID: '5', Permission: 15 }]);

    const addedAcl = await client.callTool({
      name: 'moveit_add_acl',
      arguments: { acl: { Type: 'usergroup', Permission: 15 } },
    });
    expect(
      JSON.parse(
        (addedAcl.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      Type: 'usergroup',
      Permission: 15,
    });

    const updatedAcl = await client.callTool({
      name: 'moveit_update_acl',
      arguments: { aclId: '5', acl: { ID: '5', Permission: 7 } },
    });
    expect(
      JSON.parse(
        (updatedAcl.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      ID: '5',
      Permission: 7,
    });

    const deletedAcl = await client.callTool({
      name: 'moveit_delete_acl',
      arguments: { aclId: '5' },
    });
    expect(
      JSON.parse(
        (deletedAcl.content as Array<{ type: string; text: string }>)[0].text
      )
    ).toEqual({
      deleted: '5',
    });

    expect(fake.seenBearer()).toBe(true);
  });
});
