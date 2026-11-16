import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';
import type { MoveitClient } from '../../src/client.js';
import {
  registerMoveitAcls,
  registerMoveitResourceGroups,
} from '../../src/tools/resourcegroups.js';
import { registerMoveitSslCerts } from '../../src/tools/sslcerts.js';
import { registerMoveitStandardScripts } from '../../src/tools/standardscripts.js';
import { registerMoveitUserGroups } from '../../src/tools/usergroups.js';

type StubClient = {
  listSSLCerts: ReturnType<typeof vi.fn>;
  getSSLCert: ReturnType<typeof vi.fn>;
  listStandardScripts: ReturnType<typeof vi.fn>;
  getStandardScript: ReturnType<typeof vi.fn>;
  listUserGroups: ReturnType<typeof vi.fn>;
  getUserGroup: ReturnType<typeof vi.fn>;
  listResourceGroups: ReturnType<typeof vi.fn>;
  getResourceGroup: ReturnType<typeof vi.fn>;
  listACLs: ReturnType<typeof vi.fn>;
  getACL: ReturnType<typeof vi.fn>;
  addACL: ReturnType<typeof vi.fn>;
  updateACL: ReturnType<typeof vi.fn>;
  deleteACL: ReturnType<typeof vi.fn>;
};

function makeStub(): StubClient {
  return {
    listSSLCerts: vi.fn(),
    getSSLCert: vi.fn(),
    listStandardScripts: vi.fn(),
    getStandardScript: vi.fn(),
    listUserGroups: vi.fn(),
    getUserGroup: vi.fn(),
    listResourceGroups: vi.fn(),
    getResourceGroup: vi.fn(),
    listACLs: vi.fn(),
    getACL: vi.fn(),
    addACL: vi.fn(),
    updateACL: vi.fn(),
    deleteACL: vi.fn(),
  };
}

async function connect(
  stub: StubClient,
  register: (server: McpServer, client: MoveitClient) => void,
): Promise<Client> {
  const server = new McpServer({ name: 'test-server', version: '0.0.0' });
  register(server, stub as unknown as MoveitClient);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

async function call(
  name: string,
  args: Record<string, unknown>,
  stub: StubClient,
  register: (server: McpServer, client: MoveitClient) => void,
) {
  const client = await connect(stub, register);
  return (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
}

describe('moveit SSL certificate tools', () => {
  it('moveit_list_ssl_certificates calls client.listSSLCerts with parsed params', async () => {
    const stub = makeStub();
    const fixture = { items: [{ Thumbprint: 'AB12', Name: 'ca' }] };
    stub.listSSLCerts.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_ssl_certificates',
      { fields: 'Thumbprint,Name', page: 1, perPage: 25 },
      stub,
      registerMoveitSslCerts,
    );
    expect(stub.listSSLCerts).toHaveBeenCalledWith({
      fields: 'Thumbprint,Name',
      page: 1,
      perPage: 25,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_list_ssl_certificates accepts no params', async () => {
    const stub = makeStub();
    stub.listSSLCerts.mockResolvedValue({ items: [] });
    await call(
      'moveit_list_ssl_certificates',
      {},
      stub,
      registerMoveitSslCerts,
    );
    expect(stub.listSSLCerts).toHaveBeenCalledWith({});
  });

  it('moveit_get_ssl_certificate calls client.getSSLCert', async () => {
    const stub = makeStub();
    const fixture = { Thumbprint: 'AB12', Name: 'ca' };
    stub.getSSLCert.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_ssl_certificate',
      { thumbprint: 'AB12' },
      stub,
      registerMoveitSslCerts,
    );
    expect(stub.getSSLCert).toHaveBeenCalledWith('AB12');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_ssl_certificate rejects empty thumbprint', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_ssl_certificate',
      { thumbprint: '' },
      stub,
      registerMoveitSslCerts,
    );
    expect(result.isError).toBe(true);
    expect(stub.getSSLCert).not.toHaveBeenCalled();
  });
});

describe('moveit standard script tools', () => {
  it('moveit_list_standard_scripts calls client.listStandardScripts', async () => {
    const stub = makeStub();
    const fixture = { items: [{ Name: 'rotate' }] };
    stub.listStandardScripts.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_standard_scripts',
      { name: 'rotate', page: 1, perPage: 10 },
      stub,
      registerMoveitStandardScripts,
    );
    expect(stub.listStandardScripts).toHaveBeenCalledWith({
      name: 'rotate',
      page: 1,
      perPage: 10,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_standard_script calls client.getStandardScript', async () => {
    const stub = makeStub();
    const fixture = { Name: 'rotate' };
    stub.getStandardScript.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_standard_script',
      { standardScriptId: 'rotate' },
      stub,
      registerMoveitStandardScripts,
    );
    expect(stub.getStandardScript).toHaveBeenCalledWith('rotate');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_standard_script rejects empty standardScriptId', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_standard_script',
      { standardScriptId: '' },
      stub,
      registerMoveitStandardScripts,
    );
    expect(result.isError).toBe(true);
    expect(stub.getStandardScript).not.toHaveBeenCalled();
  });
});

describe('moveit user group tools', () => {
  it('moveit_list_user_groups calls client.listUserGroups', async () => {
    const stub = makeStub();
    const fixture = { items: [{ Name: 'admins' }] };
    stub.listUserGroups.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_user_groups',
      { name: 'admins' },
      stub,
      registerMoveitUserGroups,
    );
    expect(stub.listUserGroups).toHaveBeenCalledWith({ name: 'admins' });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_user_group calls client.getUserGroup', async () => {
    const stub = makeStub();
    const fixture = { Name: 'admins' };
    stub.getUserGroup.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_user_group',
      { userGroupName: 'admins' },
      stub,
      registerMoveitUserGroups,
    );
    expect(stub.getUserGroup).toHaveBeenCalledWith('admins');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_user_group rejects empty userGroupName', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_user_group',
      { userGroupName: '' },
      stub,
      registerMoveitUserGroups,
    );
    expect(result.isError).toBe(true);
    expect(stub.getUserGroup).not.toHaveBeenCalled();
  });
});

describe('moveit resource group tools', () => {
  it('moveit_list_resource_groups calls client.listResourceGroups', async () => {
    const stub = makeStub();
    const fixture = { items: [{ Name: 'reports' }] };
    stub.listResourceGroups.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_resource_groups',
      { page: 1, perPage: 25 },
      stub,
      registerMoveitResourceGroups,
    );
    expect(stub.listResourceGroups).toHaveBeenCalledWith({
      page: 1,
      perPage: 25,
    });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_resource_group calls client.getResourceGroup', async () => {
    const stub = makeStub();
    const fixture = { Name: 'reports' };
    stub.getResourceGroup.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_resource_group',
      { resourceGroupName: 'reports' },
      stub,
      registerMoveitResourceGroups,
    );
    expect(stub.getResourceGroup).toHaveBeenCalledWith('reports');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_resource_group rejects empty resourceGroupName', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_resource_group',
      { resourceGroupName: '' },
      stub,
      registerMoveitResourceGroups,
    );
    expect(result.isError).toBe(true);
    expect(stub.getResourceGroup).not.toHaveBeenCalled();
  });
});

describe('moveit ACL tools', () => {
  it('moveit_list_acls calls client.listACLs', async () => {
    const stub = makeStub();
    const fixture = { items: [{ ID: '5' }] };
    stub.listACLs.mockResolvedValue(fixture);
    const result = await call(
      'moveit_list_acls',
      { page: 1 },
      stub,
      registerMoveitAcls,
    );
    expect(stub.listACLs).toHaveBeenCalledWith({ page: 1 });
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_acl calls client.getACL', async () => {
    const stub = makeStub();
    const fixture = { ID: '5', Permission: 15 };
    stub.getACL.mockResolvedValue(fixture);
    const result = await call(
      'moveit_get_acl',
      { aclId: '5' },
      stub,
      registerMoveitAcls,
    );
    expect(stub.getACL).toHaveBeenCalledWith('5');
    expect(JSON.parse(result.content[0].text)).toEqual(fixture);
  });

  it('moveit_get_acl rejects empty aclId', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_get_acl',
      { aclId: '' },
      stub,
      registerMoveitAcls,
    );
    expect(result.isError).toBe(true);
    expect(stub.getACL).not.toHaveBeenCalled();
  });

  it('moveit_add_acl calls client.addACL with the acl verbatim', async () => {
    const stub = makeStub();
    const acl = { Type: 'usergroup', Permission: 15, TargetName: 'admins' };
    stub.addACL.mockResolvedValue({ ...acl, ID: '5' });
    const result = await call(
      'moveit_add_acl',
      { acl },
      stub,
      registerMoveitAcls,
    );
    expect(stub.addACL).toHaveBeenCalledWith(acl);
    expect(JSON.parse(result.content[0].text)).toEqual({ ...acl, ID: '5' });
  });

  it('moveit_add_acl rejects an empty acl record', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_add_acl',
      { acl: {} },
      stub,
      registerMoveitAcls,
    );
    expect(result.isError).toBe(true);
    expect(stub.addACL).not.toHaveBeenCalled();
  });

  it('moveit_update_acl calls client.updateACL with aclId and acl', async () => {
    const stub = makeStub();
    const acl = { ID: '5', Permission: 7 };
    stub.updateACL.mockResolvedValue(acl);
    const result = await call(
      'moveit_update_acl',
      { aclId: '5', acl },
      stub,
      registerMoveitAcls,
    );
    expect(stub.updateACL).toHaveBeenCalledWith('5', acl);
    expect(JSON.parse(result.content[0].text)).toEqual(acl);
  });

  it('moveit_update_acl rejects an empty acl record', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_update_acl',
      { aclId: '5', acl: {} },
      stub,
      registerMoveitAcls,
    );
    expect(result.isError).toBe(true);
    expect(stub.updateACL).not.toHaveBeenCalled();
  });

  it('moveit_delete_acl calls client.deleteACL', async () => {
    const stub = makeStub();
    stub.deleteACL.mockResolvedValue(null);
    const result = await call(
      'moveit_delete_acl',
      { aclId: '5' },
      stub,
      registerMoveitAcls,
    );
    expect(stub.deleteACL).toHaveBeenCalledWith('5');
    expect(JSON.parse(result.content[0].text)).toBeNull();
  });

  it('moveit_delete_acl rejects empty aclId', async () => {
    const stub = makeStub();
    const result = await call(
      'moveit_delete_acl',
      { aclId: '' },
      stub,
      registerMoveitAcls,
    );
    expect(result.isError).toBe(true);
    expect(stub.deleteACL).not.toHaveBeenCalled();
  });
});
