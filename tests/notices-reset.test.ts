import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Notices & System Reset Suite', () => {
  let server: TestServer;
  let adminToken: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('NOTICE-1: Authenticated user can fetch school notices', async () => {
    const res = await server.request('/api/notices', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notices));
  });

  test('NOTICE-2: Student cannot publish a notice (403)', async () => {
    const res = await server.request('/api/notices', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        title: 'Unauthorized Student Notice',
        content: 'This should not be allowed.',
      }),
    });

    assert.equal(res.status, 403);
  });

  test('NOTICE-3: Admin can create and delete a notice', async () => {
    const createRes = await server.request('/api/notices', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        title: 'Mid-Term Examination Schedule Announcement',
        content: 'Examinations for all classes begin from the second week of next month.',
        priority: 'high',
        targetAudience: 'all',
      }),
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.notice);
    const noticeId = createRes.body.notice.id;

    const delRes = await server.request(`/api/notices/${noticeId}`, {
      method: 'DELETE',
      headers: server.authHeaders(adminToken),
    });

    assert.equal(delRes.status, 200);
  });

  test('RESET-1: Unauthenticated request to /api/system/reset-demo fails with 401', async () => {
    const res = await server.request('/api/system/reset-demo', {
      method: 'POST',
    });

    assert.equal(res.status, 401);
  });

  test('RESET-2: Student request to /api/system/reset-demo fails with 403', async () => {
    const res = await server.request('/api/system/reset-demo', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 403);
  });

  test('RESET-3: Superadmin request to /api/system/reset-demo succeeds', async () => {
    const res = await server.request('/api/system/reset-demo', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
  });
});
