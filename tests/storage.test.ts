import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Storage & Data Persistence Suite', () => {
  let server: TestServer;
  let adminToken: string;

  before(async () => {
    server = await startTestServer();
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('STORAGE-1: Local database file exists and contains valid JSON payload', () => {
    assert.ok(fs.existsSync(server.dbPath), 'DB file must exist');
    const raw = fs.readFileSync(server.dbPath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.users), 'Must have users array');
    assert.ok(parsed.users.length > 0);
  });

  test('STORAGE-2: State changes persist across memory to disk', async () => {
    const uniqueName = `Persistence Test User ${Date.now()}`;
    const createRes = await server.request('/api/auth/users', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: uniqueName,
        role: 'student',
        username: `pers.${Date.now()}`,
        password: 'ValidPass#123',
        classId: 'cls-10',
        divisionId: 'div-10-a',
        rollNo: `88${Date.now().toString().slice(-4)}`,
      }),
    });
    assert.equal(createRes.status, 201);

    // Read directly from disk to confirm persistent serialization
    const diskContent = fs.readFileSync(server.dbPath, 'utf-8');
    assert.ok(diskContent.includes(uniqueName), 'Disk file must contain newly created user');
  });

  test('STORAGE-3: File upload endpoint requires authentication', async () => {
    const res = await server.request('/api/storage/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'test.png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    });

    assert.equal(res.status, 401);
  });

  test('STORAGE-4: Authenticated user can upload a file data URL and retrieve it', async () => {
    const filename = `diagram-${Date.now()}.png`;
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const uploadRes = await server.request('/api/storage/upload', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({ filename, dataUrl }),
    });

    assert.ok(uploadRes.status === 200 || uploadRes.status === 201);
    assert.ok(uploadRes.body.url);

    // Retrieve file
    const fileRes = await server.request(uploadRes.body.url);
    assert.equal(fileRes.status, 200);
  });
});
