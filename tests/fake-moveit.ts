import * as http from 'node:http';

export interface FakeMoveit {
  server: http.Server;
  port: number;
  close(): Promise<void>;
  seenBearer(): boolean;
  seenTokens(): string[];
}

export function startFakeMoveit(): Promise<FakeMoveit> {
  let seenBearer = false;
  const tokens: string[] = [];
  const app = http.createServer(
    (req: http.IncomingMessage, res: http.ServerResponse) => {
      const auth = req.headers.authorization;
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        seenBearer = true;
        tokens.push(auth.slice('Bearer '.length));
      }
      const pathname = new URL(req.url ?? '/', 'http://x').pathname;
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && pathname === '/webadmin/api/v1/token') {
        res.end(
          JSON.stringify({
            access_token: 'fake-access-1',
            token_type: 'bearer',
            expires_in: 900,
            refresh_token: 'fake-refresh-1',
          }),
        );
        return;
      }
      if (req.method === 'GET' && pathname === '/webadmin/api/v1/info') {
        res.end(
          JSON.stringify({
            version: '2019.1.0',
            server: 'MOVEit Automation',
          }),
        );
        return;
      }
      if (req.method === 'GET' && pathname === '/webadmin/api/v1/tasks') {
        res.end(
          JSON.stringify({
            paging: { page: 1, perPage: 25, total: 1 },
            items: [{ ID: '226676691', Name: '!TaylorImportTest', Active: 0 }],
          }),
        );
        return;
      }
      if (
        req.method === 'GET' &&
        pathname === '/webadmin/api/v1/tasks/226676691'
      ) {
        res.end(JSON.stringify({ ID: '226676691', Name: '!TaylorImportTest' }));
        return;
      }
      if (req.method === 'POST' && pathname === '/webadmin/api/v1/tasks') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.statusCode = 201;
          res.end(body || '{}');
        });
        return;
      }
      {
        const m = pathname.match(/^\/webadmin\/api\/v1\/tasks\/([^/]+)$/);
        if (m && req.method === 'PUT') {
          let body = '';
          req.on('data', (c: Buffer) => (body += c));
          req.on('end', () => {
            res.end(body || '{}');
          });
          return;
        }
        if (m && req.method === 'DELETE') {
          res.end(JSON.stringify({ deleted: m[1] }));
          return;
        }
      }
      {
        const logMatch = pathname.match(
          /^\/webadmin\/api\/v1\/tasks\/([^/]+)\/log$/,
        );
        if (logMatch && req.method === 'GET') {
          res.end(
            JSON.stringify({
              paging: { page: 1, perPage: 25, total: 1 },
              items: [{ TaskLogID: '987', Name: 'log-entry-1' }],
            }),
          );
          return;
        }
        const logIdMatch = pathname.match(
          /^\/webadmin\/api\/v1\/tasks\/([^/]+)\/log\/([^/]+)$/,
        );
        if (logIdMatch && req.method === 'GET') {
          res.end(
            JSON.stringify({
              TaskLogID: logIdMatch[2],
              LogData: 'line1\nline2',
            }),
          );
          return;
        }
        const killMatch = pathname.match(
          /^\/webadmin\/api\/v1\/tasks\/([^/]+)\/kill$/,
        );
        if (killMatch && req.method === 'POST') {
          res.end(JSON.stringify({ killed: killMatch[1] }));
          return;
        }
      }
      if (
        req.method === 'GET' &&
        pathname === '/webadmin/api/v1/tasks/scheduler'
      ) {
        res.end(JSON.stringify({ Status: 'Stopped' }));
        return;
      }
      if (
        req.method === 'POST' &&
        pathname === '/webadmin/api/v1/reports/export'
      ) {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.end(JSON.stringify({ ExportedReportID: 'export-1' }));
        });
        return;
      }
      if (
        req.method === 'POST' &&
        pathname === '/webadmin/api/v1/config/import'
      ) {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.statusCode = 204;
          res.end();
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/webadmin/api/v1/config') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.end(JSON.stringify({ configXML: '<config/>' }));
        });
        return;
      }
      const configFixture = { Settings: { adminEmail: 'admin@example.com' } };
      if (req.method === 'GET' && pathname === '/webadmin/api/v1/config') {
        res.end(JSON.stringify(configFixture));
        return;
      }
      if (req.method === 'PUT' && pathname === '/webadmin/api/v1/config') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          res.end(body || '{}');
        });
        return;
      }
      const catalogFixtures = {
        '/webadmin/api/v1/sslcerts': {
          paging: { page: 1, perPage: 25, total: 1 },
          items: [{ Thumbprint: 'AB12', Name: 'Root CA' }],
        },
        '/webadmin/api/v1/standardscripts': {
          paging: { page: 1, perPage: 25, total: 1 },
          items: [{ Name: 'pgp-encrypt' }],
        },
        '/webadmin/api/v1/usergroups': {
          paging: { page: 1, perPage: 25, total: 1 },
          items: [{ Name: 'admins' }],
        },
        '/webadmin/api/v1/resourcegroups': {
          paging: { page: 1, perPage: 25, total: 1 },
          items: [{ Name: 'reports' }],
        },
        '/webadmin/api/v1/resourcegroups/acls': {
          paging: { page: 1, perPage: 25, total: 1 },
          items: [{ ID: '5', Permission: 15 }],
        },
      };
      const catalog = catalogFixtures[pathname as keyof typeof catalogFixtures];
      if (req.method === 'GET' && catalog) {
        res.end(JSON.stringify(catalog));
        return;
      }
      const certMatch = pathname.match(
        /^\/webadmin\/api\/v1\/sslcerts\/([^/]+)$/,
      );
      if (certMatch && req.method === 'GET') {
        res.end(JSON.stringify({ Thumbprint: certMatch[1], Name: 'Root CA' }));
        return;
      }
      const scriptMatch = pathname.match(
        /^\/webadmin\/api\/v1\/standardscripts\/([^/]+)$/,
      );
      if (scriptMatch && req.method === 'GET') {
        res.end(JSON.stringify({ Name: scriptMatch[1] }));
        return;
      }
      const ugMatch = pathname.match(
        /^\/webadmin\/api\/v1\/usergroups\/([^/]+)$/,
      );
      if (ugMatch && req.method === 'GET') {
        res.end(JSON.stringify({ Name: ugMatch[1] }));
        return;
      }
      const rgMatch = pathname.match(
        /^\/webadmin\/api\/v1\/resourcegroups\/([^/]+)$/,
      );
      if (rgMatch && req.method === 'GET') {
        res.end(JSON.stringify({ Name: rgMatch[1] }));
        return;
      }
      if (pathname === '/webadmin/api/v1/resourcegroups/acls') {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (cbuf: Buffer) => (body += cbuf));
          req.on('end', () => {
            res.statusCode = 201;
            res.end(body || '{}');
          });
          return;
        }
      } else {
        const aclMatch = pathname.match(
          /^\/webadmin\/api\/v1\/resourcegroups\/acls\/([^/]+)$/,
        );
        if (aclMatch) {
          if (req.method === 'GET') {
            res.end(JSON.stringify({ ID: aclMatch[1], Permission: 15 }));
            return;
          }
          if (req.method === 'PUT') {
            let body = '';
            req.on('data', (cbuf: Buffer) => (body += cbuf));
            req.on('end', () => {
              res.end(body || '{}');
            });
            return;
          }
          if (req.method === 'DELETE') {
            res.end(JSON.stringify({ deleted: aclMatch[1] }));
            return;
          }
        }
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ detail: 'Not found' }));
    },
  );
  return new Promise((resolve) => {
    app.listen(0, '127.0.0.1', () => {
      const addr = app.address() as { port: number };
      resolve({
        server: app,
        port: addr.port,
        close: () => new Promise<void>((res) => app.close(() => res())),
        seenBearer: () => seenBearer,
        seenTokens: () => tokens,
      });
    });
  });
}
