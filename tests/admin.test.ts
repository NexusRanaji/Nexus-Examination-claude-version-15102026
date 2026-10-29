import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Admin & Superadmin Portal QA Suite', () => {
  let server: TestServer;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  let parentToken: string;

  before(async () => {
    server = await startTestServer();

    // Authenticate Superadmin
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    // Authenticate Teacher
    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    // Authenticate Student
    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;

    // Authenticate Parent
    const parentLogin = await server.login('parent.sharma', 'ParentPass#2025');
    parentToken = parentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  // --- 1. Authentication & RBAC Restrictions ---
  test('ADM-1: Superadmin login with valid credentials succeeds and returns JWT with superadmin role', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'Admin@Nexus2025!' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'superadmin');
    assert.equal(res.body.user.name, 'Dr. R. K. Deshmukh');
  });

  test('ADM-2: Non-superadmin roles are rejected (403) from admin endpoints', async () => {
    const endpoints = [
      '/api/admin/stats',
      '/api/admin/credentials',
      '/api/admin/reports/school-analytics',
      '/api/admin/audits/logins',
      '/api/admin/audits/cheating',
      '/api/admin/audits/deleted-credentials',
    ];

    for (const ep of endpoints) {
      // Student check
      const studentRes = await server.request(ep, {
        headers: server.authHeaders(studentToken),
      });
      assert.equal(studentRes.status, 403, `Student should receive 403 on ${ep}`);

      // Parent check
      const parentRes = await server.request(ep, {
        headers: server.authHeaders(parentToken),
      });
      assert.equal(parentRes.status, 403, `Parent should receive 403 on ${ep}`);

      // Teacher check
      const teacherRes = await server.request(ep, {
        headers: server.authHeaders(teacherToken),
      });
      assert.equal(teacherRes.status, 403, `Teacher should receive 403 on ${ep}`);
    }

    // Class mutation requires superadmin
    const studentClassCreate = await server.request('/api/admin/classes', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ name: 'Unauthorized Class', level: 10 }),
    });
    assert.equal(studentClassCreate.status, 403);
  });

  test('ADM-3: Unauthenticated request to admin endpoints returns 401', async () => {
    const res = await server.request('/api/admin/stats');
    assert.equal(res.status, 401);
  });

  // --- 2. Admin Dashboard Stats & Master Directory ---
  test('ADM-4: Superadmin fetches /api/admin/stats with valid institutional counts', async () => {
    const res = await server.request('/api/admin/stats', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(typeof res.body.totalStudents === 'number' && res.body.totalStudents > 0);
    assert.ok(typeof res.body.totalTeachers === 'number' && res.body.totalTeachers > 0);
    assert.ok(typeof res.body.totalParents === 'number' && res.body.totalParents > 0);
    assert.ok(typeof res.body.totalClasses === 'number' && res.body.totalClasses > 0);
    assert.ok(typeof res.body.totalExams === 'number');
    assert.ok(typeof res.body.avgPassRate === 'number');
  });

  test('ADM-5: Master Directory pagination works with limit and offset', async () => {
    const res = await server.request('/api/admin/credentials?limit=5&offset=0', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length <= 5);
    assert.ok(res.body.pagination);
    assert.equal(res.body.pagination.limit, 5);
    assert.equal(res.body.pagination.offset, 0);
    assert.ok(typeof res.body.pagination.total === 'number' && res.body.pagination.total > 0);
  });

  test('ADM-6: Master Directory contains all required institutional roles with confidential credentials', async () => {
    const res = await server.request('/api/admin/credentials?limit=2000', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.some((u: any) => u.role === 'superadmin'));
    assert.ok(res.body.users.some((u: any) => u.role === 'teacher'));
    assert.ok(res.body.users.some((u: any) => u.role === 'student'));
    assert.ok(res.body.users.some((u: any) => u.role === 'parent'));
    // Verify plaintext passwords and raw credentials are not exposed in directory responses (HIGH-02)
    assert.ok(res.body.users.every((u: any) => u.password === undefined && u.rawPassword === undefined));
  });

  // --- 3. Single Credential Generation ---
  test('ADM-7: Superadmin creates single credential with auto-generated secure password', async () => {
    const uniqueSuffix = Date.now().toString().slice(-4);
    const createRes = await server.request('/api/admin/create-credential', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: `Faculty Member ${uniqueSuffix}`,
        email: `faculty${uniqueSuffix}@nexusrana.edu`,
        role: 'teacher',
        employeeId: `FAC-${uniqueSuffix}`,
      }),
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.user);
    assert.equal(createRes.body.user.role, 'teacher');
    assert.ok(createRes.body.temporaryPassword || createRes.body.rawPassword);
  });

  test('ADM-8: Superadmin single student creation rejects missing class or roll number', async () => {
    const res = await server.request('/api/admin/create-credential', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: 'Incomplete Student',
        role: 'student',
        // Missing classId and rollNo
      }),
    });

    assert.equal(res.status, 400);
  });

  // --- 4. Bulk Credential Upload & Verification ---
  test('ADM-9: Bulk upload with "users" payload format creates student accounts', async () => {
    const ts = Date.now().toString().slice(-4);
    const bulkPayload = {
      users: [
        {
          name: `Bulk Student One ${ts}`,
          role: 'student',
          className: 'Standard 10',
          divisionName: 'Division A',
          rollNo: `ROL1-${ts}`,
          email: `bulk1.${ts}@example.com`,
        },
        {
          name: `Bulk Student Two ${ts}`,
          role: 'student',
          className: 'Standard 10',
          divisionName: 'Division B',
          rollNo: `ROL2-${ts}`,
          email: `bulk2.${ts}@example.com`,
        },
      ],
    };

    const res = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(bulkPayload),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.importedCount, 2);
    assert.ok(Array.isArray(res.body.users));
    assert.equal(res.body.users.length, 2);
    assert.ok(res.body.users[0].rawPassword || res.body.users[0].password);
  });

  test('ADM-10: Bulk upload with "credentials" payload format (teammate support) succeeds', async () => {
    const ts = Date.now().toString().slice(-4);
    const bulkPayload = {
      credentials: [
        {
          name: `Cred Batch User ${ts}`,
          role: 'student',
          className: 'Standard 10',
          divisionName: 'Division A',
          rollNo: `ROL3-${ts}`,
          email: `credbatch.${ts}@example.com`,
        },
      ],
    };

    const res = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(bulkPayload),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.importedCount, 1);
  });

  test('ADM-11: Bulk upload skips students missing rollNo or className', async () => {
    const ts = Date.now().toString().slice(-4);
    const invalidBatch = {
      users: [
        {
          name: `No Roll Student ${ts}`,
          role: 'student',
          className: 'Standard 10',
          // rollNo missing
        },
        {
          name: `No Class Student ${ts}`,
          role: 'student',
          rollNo: `999-${ts}`,
          // className missing
        },
      ],
    };

    const res = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(invalidBatch),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.importedCount, 0);
    assert.equal(res.body.skippedDuplicates.length, 2);
  });

  test('ADM-12: Bulk upload allows teachers and parents without class/roll number', async () => {
    const ts = Date.now().toString().slice(-4);
    const staffBatch = {
      users: [
        {
          name: `Visiting Teacher ${ts}`,
          role: 'teacher',
          employeeId: `EMP-${ts}`,
          email: `visiting.${ts}@example.com`,
        },
        {
          name: `New Parent ${ts}`,
          role: 'parent',
          phone: `+91 98201 ${ts}`,
          email: `parent.${ts}@example.com`,
        },
      ],
    };

    const res = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(staffBatch),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.importedCount, 2);
  });

  test('ADM-13: Bulk upload skips rows with empty name or missing staff employeeId', async () => {
    const invalidBatch = {
      users: [
        {
          name: '',
          role: 'student',
          className: 'Standard 10',
          rollNo: '101',
        },
        {
          name: 'Teacher Without EmpId',
          role: 'teacher',
          // employeeId missing
        },
      ],
    };

    const res = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(invalidBatch),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.importedCount, 0);
    assert.equal(res.body.skippedDuplicates.length, 2);
  });

  test('ADM-14: Bulk upload rejects empty or malformed payload with 400', async () => {
    const emptyPayload = {};
    const res1 = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(emptyPayload),
    });
    assert.equal(res1.status, 400);

    const emptyArray = { users: [] };
    const res2 = await server.request('/api/admin/credentials/bulk', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(emptyArray),
    });
    assert.equal(res2.status, 400);
  });

  // --- 5. Curriculum & Teacher Assignments ---
  test('ADM-15: Superadmin fetches curriculum structure via /api/admin/classes', async () => {
    const res = await server.request('/api/admin/classes', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.classes));
    assert.ok(res.body.classes.length > 0);
    assert.ok(res.body.classes.some((c: any) => c.name.includes('10')));
  });

  test('ADM-16: Superadmin assigns teacher to class & subject via /api/admin/teachers/assign', async () => {
    // Fetch classes and teachers
    const classesRes = await server.request('/api/admin/classes', {
      headers: server.authHeaders(adminToken),
    });
    const cls = classesRes.body.classes[0];
    assert.ok(cls);
    const div = classesRes.body.divisions.find((d: any) => d.classId === cls.id) || classesRes.body.divisions[0];
    assert.ok(div);
    const subj = classesRes.body.subjects[0];
    assert.ok(subj);

    const usersRes = await server.request('/api/admin/credentials?limit=100', {
      headers: server.authHeaders(adminToken),
    });
    const teacher = usersRes.body.users.find((u: any) => u.role === 'teacher');
    assert.ok(teacher);

    const assignRes = await server.request('/api/admin/teachers/assign', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        teacherId: teacher.id,
        assignments: [
          {
            classId: cls.id,
            divisionId: div.id,
            subjectId: subj.id,
          },
        ],
      }),
    });

    assert.equal(assignRes.status, 200);
    assert.ok(assignRes.body.teacher);
  });

  // --- 6. School Reports & CBSE Grade Bands ---
  test('ADM-17: School Analytics endpoint computes valid CBSE grade distribution', async () => {
    const res = await server.request('/api/admin/reports/school-analytics', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.summary);
    assert.ok(typeof res.body.summary.totalStudents === 'number');
    assert.ok(typeof res.body.summary.overallPassRate === 'number');
    assert.ok(typeof res.body.summary.overallAverageScore === 'number');

    // Verify CBSE grade distribution array exists with all 8 standard bands
    assert.ok(Array.isArray(res.body.cbseGradeDistribution));
    const dist = res.body.cbseGradeDistribution;
    // Expected CBSE bands: A1, A2, B1, B2, C1, C2, D, E
    const expectedBands = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
    for (const band of expectedBands) {
      assert.ok(
        dist.some((b: any) => b.grade === band && typeof b.count === 'number'),
        `Grade distribution must include CBSE band ${band}`
      );
    }
  });

  // --- 7. Notice Board Administration ---
  test('ADM-18: Admin creates, verifies, and deletes school notices', async () => {
    const ts = Date.now().toString().slice(-4);
    const createRes = await server.request('/api/notices', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        title: `Annual Sports Day Circular ${ts}`,
        content: 'Annual sports events will commence on the last Friday of this month.',
        priority: 'high',
        targetAudience: 'all',
      }),
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.notice);
    const noticeId = createRes.body.notice.id;

    // Verify presence in notice board
    const listRes = await server.request('/api/notices', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.notices.some((n: any) => n.id === noticeId));

    // Delete notice
    const delRes = await server.request(`/api/notices/${noticeId}`, {
      method: 'DELETE',
      headers: server.authHeaders(adminToken),
    });
    assert.equal(delRes.status, 200);
  });

  // --- 8. Support Tickets & Persistence ---
  test('ADM-19: Admin views, updates status, and replies to support tickets', async () => {
    // Create an isolated ticket from parent first
    const ts = Date.now().toString().slice(-4);
    const createRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: `Fee Receipt Query ${ts}`,
        category: 'academic',
        message: 'Could you please verify the term 1 fee receipt for Aarav?',
        priority: 'medium',
      }),
    });
    assert.equal(createRes.status, 201);
    const ticketId = createRes.body.ticket.id;

    // Admin views tickets
    const viewRes = await server.request('/api/tickets', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(viewRes.status, 200);
    assert.ok(viewRes.body.tickets.some((t: any) => t.id === ticketId));

    // Admin replies to ticket
    const replyRes = await server.request(`/api/tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        message: 'Receipt has been verified and emailed to your registered address.',
      }),
    });
    assert.equal(replyRes.status, 201);

    // Admin updates status to resolved
    const statusRes = await server.request(`/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        status: 'resolved',
      }),
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.ticket.status.toLowerCase(), 'resolved');
  });

  // --- 9. Audit Queues & Malpractice Oversight ---
  test('ADM-20: Admin can retrieve login, cheating, deletion audits, and key health', async () => {
    const [loginRes, cheatRes, delRes, keyRes] = await Promise.all([
      server.request('/api/admin/audits/logins', { headers: server.authHeaders(adminToken) }),
      server.request('/api/admin/audits/cheating', { headers: server.authHeaders(adminToken) }),
      server.request('/api/admin/audits/deleted-credentials', { headers: server.authHeaders(adminToken) }),
      server.request('/api/admin/audits/key-health', { headers: server.authHeaders(adminToken) }),
    ]);

    assert.equal(loginRes.status, 200);
    assert.ok(Array.isArray(loginRes.body.logins || loginRes.body.audits));

    assert.equal(cheatRes.status, 200);
    assert.ok(Array.isArray(cheatRes.body.cheatingAudits || cheatRes.body.audits));

    assert.equal(delRes.status, 200);
    assert.ok(Array.isArray(delRes.body.deletedAudits || delRes.body.audits || delRes.body.deletions));

    assert.equal(keyRes.status, 200);
    assert.ok(keyRes.body.poolStatus !== undefined);
  });
});
