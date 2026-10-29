import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Notifications & Support Center Suite', () => {
  let server: TestServer;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('NOTIF-1: User can fetch personal notification list', async () => {
    const res = await server.request('/api/notifications', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notifications));
  });

  test('NOTIF-2: Student cannot broadcast notifications (403)', async () => {
    const res = await server.request('/api/notifications', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        title: 'Unauthorized Notification',
        message: 'Broadcast test',
      }),
    });

    assert.equal(res.status, 403);
  });

  test('NOTIF-3: Teacher can broadcast announcement notification', async () => {
    const res = await server.request('/api/notifications', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Revision Class Reminder',
        message: 'Physics Unit 3 doubt-clearing session at 4:00 PM today.',
        type: 'academic',
        targetAudience: 'student',
      }),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.notification);
  });

  test('NOTIF-4: User can mark all notifications as read', async () => {
    const res = await server.request('/api/notifications/read-all', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
  });
});
