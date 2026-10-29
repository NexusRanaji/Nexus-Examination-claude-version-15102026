import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { startTestServer, TestServer } from './helpers/harness.ts';

const BURNED_OLD_SECRET = 'nexus_super_secret_jwt_key_at_least_32_characters_long_2025_prod_secure';

describe('Server Hardening & Health Endpoint Suite', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('HARDEN-1: Health endpoint /healthz responds with 200 OK', async () => {
    const res = await server.request('/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('HARDEN-2: Health endpoint /api/health responds with 200 OK', async () => {
    const res = await server.request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
  });

  test('HARDEN-3: Production mode exits with code 1 if JWT_SECRET is missing or < 32 chars', async () => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'server.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'too-short',
          PORT: '59999',
        },
        shell: false,
        stdio: 'ignore',
      }
    );

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', (code) => resolve(code));
    });

    assert.equal(exitCode, 1, 'Server must exit with status 1 in production without proper JWT_SECRET');
  });

  test('HARDEN-4: Burned old fallback JWT secret is not used as active secret', async () => {
    assert.notEqual(server.jwtSecret, BURNED_OLD_SECRET, 'Test server must not use the burned key');
  });

  test('HARDEN-5: server.js bundle exists or can be built without errors', () => {
    const serverJsPath = path.resolve(process.cwd(), 'server.js');
    assert.ok(fs.existsSync(serverJsPath), 'server.js should exist in the repository');
  });
});
