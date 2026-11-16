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
  const app = http.createServer((req, res) => {
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
    res.statusCode = 404;
    res.end(JSON.stringify({ detail: 'Not found' }));
  });
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
