import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Parent Helpdesk Tickets Suite', () => {
  let server: TestServer;
  let parentToken: string;
  let teacherToken: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();
    const parentLogin = await server.login('parent.sharma', 'ParentPass#2025');
    parentToken = parentLogin.token;

    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('TKT-1: Student cannot open parent support tickets (403)', async () => {
    const res = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        subject: 'Student Query',
        message: 'Student trying to open ticket directly',
      }),
    });

    assert.equal(res.status, 403);
  });

  test('TKT-2: Parent can view their ticket list', async () => {
    const res = await server.request('/api/tickets', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.tickets));
  });

  test('TKT-3: Parent can create, reply, and resolve a support ticket', async () => {
    // 1. Create ticket
    const createRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: 'Inquiry Regarding Physics Mid-Term Evaluation',
        category: 'academic',
        message: 'Dear Sir, could you please clarify the grading criteria for question 4?',
        priority: 'medium',
      }),
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.ticket);
    const ticketId = createRes.body.ticket.id;

    // 2. Teacher replies
    const replyRes = await server.request(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        message: 'Hello, the question was evaluated based on the derivation steps provided in CBSE guidelines.',
      }),
    });
    assert.equal(replyRes.status, 201);
    assert.ok(replyRes.body.ticket.replies.length >= 1);

    // 3. Teacher updates status to resolved
    const statusRes = await server.request(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.ticket.status.toLowerCase(), 'resolved');

    // 4. Parent deletes ticket
    const delRes = await server.request(`/api/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: server.authHeaders(parentToken),
    });
    assert.equal(delRes.status, 200);
  });
});
