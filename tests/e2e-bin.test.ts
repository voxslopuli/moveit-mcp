import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { env: parentEnv } = process as {
  env: Record<string, string | undefined>;
};

describe('bin launched via symlink', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'moveit-bin-'));
  const dist = join(process.cwd(), 'dist', 'index.js');
  const link = join(tmp, 'moveit-mcp');

  beforeAll(() => {
    execSync('npx tsup', { cwd: process.cwd(), stdio: 'inherit' });
    symlinkSync(dist, link);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('exits 1 with a config error instead of exiting 0 silently', () => {
    const childEnv = Object.fromEntries(
      Object.entries(parentEnv).filter(([k]) => !k.startsWith('MOVEIT_'))
    ) as Record<string, string>;
    const res = spawnSync('node', [link], { env: childEnv, encoding: 'utf8' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Missing required environment variables');
  });
});
