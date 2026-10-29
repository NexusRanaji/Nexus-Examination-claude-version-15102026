import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Parent Portal & Academic Oversight Suite', () => {
  let server: TestServer;
  let parentToken: string;
  let teacherToken: string;
  let studentToken: string;
  let adminToken: string;

  before(async () => {
    server = await startTestServer();

    // Authenticate parent
    const parentLogin = await server.login('parent.sharma', 'ParentPass#2025');
    parentToken = parentLogin.token;

    // Authenticate teacher
    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    // Authenticate student
    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;

    // Authenticate admin
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  // --- 1. Authentication & Role Restrictions ---
  test('PAR-1: Parent login with valid credentials succeeds and returns JWT', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'parent.sharma', password: 'ParentPass#2025' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'parent');
    assert.equal(res.body.user.name, 'Mr. Rajesh Sharma');
  });

  test('PAR-2: Parent login with invalid password returns 401', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'parent.sharma', password: 'WrongPassword#999' }),
    });

    assert.equal(res.status, 401);
  });

  test('PAR-3: Unauthenticated request to /api/parent/children returns 401', async () => {
    const res = await server.request('/api/parent/children');
    assert.equal(res.status, 401);
  });

  test('PAR-4: Student role cannot access /api/parent/children (403)', async () => {
    const res = await server.request('/api/parent/children', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(res.status, 403);
  });

  test('PAR-5: Teacher role cannot access /api/parent/children (403)', async () => {
    const res = await server.request('/api/parent/children', {
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(res.status, 403);
  });

  // --- 2. Parent-Child Linkage & Ward Visibility ---
  test('PAR-6: Authenticated parent can fetch their linked children', async () => {
    const res = await server.request('/api/parent/children', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.children));
    assert.ok(res.body.children.length >= 1);

    const childIds = res.body.children.map((c: any) => c.id);
    assert.ok(childIds.includes('usr-stud-1'), 'Linked child usr-stud-1 (Aarav Sharma) must be present');
    assert.ok(!childIds.includes('usr-stud-2'), 'Unlinked child usr-stud-2 (Rohan Patel) must NOT be present');
  });

  test('PAR-7: Linked children records contain resolved class and division names', async () => {
    const res = await server.request('/api/parent/children', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    const aarav = res.body.children.find((c: any) => c.id === 'usr-stud-1');
    assert.ok(aarav);
    assert.equal(aarav.name, 'Aarav Sharma');
    assert.ok(aarav.className, 'Class name must be resolved');
    assert.ok(aarav.divisionName, 'Division name must be resolved');
  });

  // --- 3. Academic Details & Cross-Child Access Protection ---
  test('PAR-8: Parent can fetch academic details for their linked child', async () => {
    const res = await server.request('/api/parent/children/usr-stud-1/details', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.student);
    assert.equal(res.body.student.id, 'usr-stud-1');
    assert.ok(Array.isArray(res.body.submissions));
  });

  test('PAR-9: Parent cannot access details of an unlinked student (403)', async () => {
    const res = await server.request('/api/parent/children/usr-stud-2/details', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 403);
    assert.match(res.body.error, /access denied|not authorized/i);
  });

  test('PAR-10: Requesting details for a non-existent student ID returns 404', async () => {
    const res = await server.request('/api/parent/children/non-existent-student-id/details', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 404);
  });

  // --- 4. Recipient Discovery & Management Exclusion Policy ---
  test('PAR-11: Parent can fetch assigned subject teacher recipients for their child', async () => {
    const res = await server.request('/api/parent/recipients?studentId=usr-stud-1', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.recipients));
    assert.ok(res.body.recipients.length > 0);

    // Verify all returned recipients are teachers
    for (const r of res.body.recipients) {
      assert.equal(r.role, 'teacher');
    }
  });

  test('PAR-12: Recipient list strictly excludes management/superadmin per institutional policy', async () => {
    const res = await server.request('/api/parent/recipients?studentId=usr-stud-1', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(res.status, 200);
    const hasAdmin = res.body.recipients.some((r: any) => r.role === 'superadmin' || r.id === 'usr-admin-1');
    assert.equal(hasAdmin, false, 'Management must be excluded from parent ticket recipients');
  });

  // --- 5. Support Ticket Helpdesk Workflows ---
  test('PAR-13: Parent cannot open a ticket for an unlinked student (403)', async () => {
    const res = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-2', // unlinked student
        recipientId: 'usr-teach-1',
        subject: 'Unauthorized Inquiry',
        message: 'Trying to inquire about someone else\'s child',
      }),
    });

    assert.equal(res.status, 403);
  });

  test('PAR-14: Parent cannot create ticket with missing subject or message (400)', async () => {
    const res = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: '',
        message: '',
      }),
    });

    assert.equal(res.status, 400);
  });

  test('PAR-15: Parent can create support query, and duplicate submission returns 409', async () => {
    const uniqueSubject = `Evaluation Query ${Date.now()}`;
    const uniqueMessage = 'Please review the science assessment grade.';

    // First submission
    const firstRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: uniqueSubject,
        category: 'Grading / Score Discrepancy',
        message: uniqueMessage,
      }),
    });

    assert.equal(firstRes.status, 201);
    assert.ok(firstRes.body.ticket);
    const ticketId = firstRes.body.ticket.id;

    // Immediate duplicate submission with identical subject and message
    const dupRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: uniqueSubject,
        category: 'Grading / Score Discrepancy',
        message: uniqueMessage,
      }),
    });

    assert.equal(dupRes.status, 409);
    assert.match(dupRes.body.error, /already open/i);

    // Clean up created ticket
    await server.request(`/api/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: server.authHeaders(parentToken),
    });
  });

  test('PAR-16: Parent cannot update ticket status via PATCH /api/tickets/:id/status (403)', async () => {
    // 1. Create a ticket
    const createRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: 'Status Restriction Test',
        message: 'Testing parent cannot resolve their own ticket',
      }),
    });
    assert.equal(createRes.status, 201);
    const ticketId = createRes.body.ticket.id;

    // 2. Parent attempts status patch
    const patchRes = await server.request(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({ status: 'Resolved' }),
    });

    assert.equal(patchRes.status, 403, 'Parent must be rejected from modifying ticket status');

    // Clean up
    await server.request(`/api/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: server.authHeaders(parentToken),
    });
  });

  test('PAR-17: Teacher can update ticket status and reply; parent receives update', async () => {
    // 1. Parent creates ticket
    const createRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: 'Term Assessment Review',
        message: 'Could you please provide feedback on mathematics performance?',
      }),
    });
    assert.equal(createRes.status, 201);
    const ticketId = createRes.body.ticket.id;

    // 2. Teacher replies
    const replyRes = await server.request(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({ message: 'Aarav showed excellent problem solving in algebra.' }),
    });
    assert.equal(replyRes.status, 201);
    assert.equal(replyRes.body.ticket.status, 'In Progress');

    // 3. Teacher marks resolved
    const statusRes = await server.request(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({ status: 'Resolved' }),
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.ticket.status, 'Resolved');

    // 4. Parent views updated ticket
    const viewRes = await server.request('/api/tickets', {
      headers: server.authHeaders(parentToken),
    });
    assert.equal(viewRes.status, 200);
    const found = viewRes.body.tickets.find((t: any) => t.id === ticketId);
    assert.ok(found);
    assert.equal(found.status, 'Resolved');
    assert.equal(found.replies.length, 1);

    // Clean up
    await server.request(`/api/tickets/${ticketId}`, {
      method: 'DELETE',
      headers: server.authHeaders(parentToken),
    });
  });
});
