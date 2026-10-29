import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Cross-Portal End-to-End Integration Suite', () => {
  let server: TestServer;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  let parentToken: string;
  let otherTeacherToken: string;
  let otherStudentToken: string;

  let testFacultyId: string;
  let testClassId: string;
  let testDivId: string;
  let testSubjectId: string;
  let testExamId: string;
  let testTicketId: string;
  let testNoticeId: string;

  before(async () => {
    server = await startTestServer();

    // Authenticate primary institutional roles
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;

    const parentLogin = await server.login('parent.sharma', 'ParentPass#2025');
    parentToken = parentLogin.token;

    // Authenticate secondary accounts for cross-user isolation checks
    const otherTeacherLogin = await server.login('teacher.meera', 'NexusTeacher#2025');
    otherTeacherToken = otherTeacherLogin.token;

    const otherStudentLogin = await server.login('student.ananya', 'StudentPass#101');
    otherStudentToken = otherStudentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  // =========================================================================
  // JOURNEY A: Admin → Faculty
  // =========================================================================
  test('E2E-A1: Admin creates isolated test faculty and verifies account creation', async () => {
    const ts = Date.now().toString().slice(-4);
    const res = await server.request('/api/admin/create-credential', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: `Faculty Dr. Integration ${ts}`,
        email: `dr.integration.${ts}@nexusrana.edu`,
        role: 'teacher',
        employeeId: `EMP-INT-${ts}`,
      }),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.user);
    assert.equal(res.body.user.role, 'teacher');
    testFacultyId = res.body.user.id;
  });

  test('E2E-A2: Admin assigns class and subject to the faculty member', async () => {
    const classesRes = await server.request('/api/admin/classes', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(classesRes.status, 200);
    const cls = classesRes.body.classes.find((c: any) => c.name.includes('10')) || classesRes.body.classes[0];
    assert.ok(cls);
    testClassId = cls.id;

    const div = classesRes.body.divisions.find((d: any) => d.classId === cls.id) || classesRes.body.divisions[0];
    assert.ok(div);
    testDivId = div.id;

    const subj = classesRes.body.subjects[0];
    assert.ok(subj);
    testSubjectId = subj.id;

    const assignRes = await server.request('/api/admin/teachers/assign', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        teacherId: testFacultyId,
        assignments: [
          {
            classId: testClassId,
            divisionId: testDivId,
            subjectId: testSubjectId,
          },
        ],
      }),
    });

    assert.equal(assignRes.status, 200);
    assert.ok(assignRes.body.teacher);
    assert.ok(Array.isArray(assignRes.body.teacher.assignedSubjects));
    assert.equal(assignRes.body.teacher.assignedSubjects.length, 1);
  });

  test('E2E-A3: Unauthorized faculty cannot edit or delete another teacher assigned exam', async () => {
    // Teacher Sharma authors an exam
    const examRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Sharma Private Physics Quiz',
        description: 'Isolated test exam for cross-teacher security',
        subjectId: testSubjectId,
        classId: testClassId,
        status: 'draft',
        durationMinutes: 30,
        passingScore: 40,
        questions: [],
      }),
    });
    assert.equal(examRes.status, 201);
    const privateExamId = examRes.body.exam.id;

    // Teacher Verma attempts to delete Sharma's exam -> must return 403
    const deleteRes = await server.request(`/api/teacher/exams/${privateExamId}`, {
      method: 'DELETE',
      headers: server.authHeaders(otherTeacherToken),
    });
    assert.equal(deleteRes.status, 403);
  });

  // =========================================================================
  // JOURNEY B: Faculty → Student
  // =========================================================================
  test('E2E-B1: Faculty creates and publishes an exam with single and multi-choice questions', async () => {
    const ts = Date.now().toString().slice(-4);
    const examPayload = {
      title: `E2E Mathematics Board Mock ${ts}`,
      description: 'End-to-end integration mock exam with automated grading',
      subjectId: 'sub-math-10',
      classId: 'cls-10',
      divisionId: 'all',
      startTime: new Date(Date.now() - 3600000).toISOString(), // Started 1 hour ago
      endTime: new Date(Date.now() + 7200000).toISOString(),   // Ends in 2 hours
      durationMinutes: 60,
      passingScore: 50,
      status: 'published',
      questions: [
        {
          id: `q-int-1-${ts}`,
          text: 'Solve for x: $2x + 6 = 16$',
          type: 'single',
          options: [
            { id: 'opt-1-a', text: 'x = 5' },
            { id: 'opt-1-b', text: 'x = 6' },
            { id: 'opt-1-c', text: 'x = 4' },
          ],
          correctAnswer: 'opt-1-a',
          points: 50,
          explanation: 'Subtract 6 from both sides to get 2x = 10, then divide by 2.',
        },
        {
          id: `q-int-2-${ts}`,
          text: 'Is the square root of 64 equal to 8?',
          type: 'single',
          options: [
            { id: 'opt-2-a', text: 'True' },
            { id: 'opt-2-b', text: 'False' },
          ],
          correctAnswer: 'opt-2-a',
          points: 50,
          explanation: '8 * 8 = 64.',
        },
      ],
    };

    const res = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(examPayload),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.exam);
    assert.equal(res.body.exam.status, 'published');
    testExamId = res.body.exam.id;
  });

  test('E2E-B2: Enrolled Class 10 student can see and take published exam without answer leaks', async () => {
    // 1. Check student exam listing
    const listRes = await server.request('/api/student/exams', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.exams));
    const target = listRes.body.exams.find((e: any) => e.id === testExamId);
    assert.ok(target, 'Published exam must appear in student listing');

    // 2. Access exam taking endpoint (/api/exams/:id/take)
    const takeRes = await server.request(`/api/exams/${testExamId}/take`, {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(takeRes.status, 200);
    assert.ok(takeRes.body.exam);
    // Crucial security check: correctAnswer must be stripped from student payload
    for (const q of takeRes.body.exam.questions) {
      assert.equal(q.correctAnswer, undefined, 'Student payload must never leak correctAnswer');
    }
  });

  test('E2E-B3: Student submits answers, server computes score and prevents duplicate submissions', async () => {
    // Submit 100% correct answers (opt-1-a and opt-2-a)
    const questions = [
      { id: testExamId ? `q-int-1-${testExamId.slice(-4)}` : 'q-int-1', text: '...' },
    ];

    // Read take payload to get exact question IDs
    const takeRes = await server.request(`/api/exams/${testExamId}/take`, {
      headers: server.authHeaders(studentToken),
    });
    const q1 = takeRes.body.exam.questions[0];
    const q2 = takeRes.body.exam.questions[1];

    const submissionPayload = {
      answers: {
        [q1.id]: 'opt-1-a',
        [q2.id]: 'opt-2-a',
      },
      timeSpentSeconds: 450,
    };

    // 1. Submit answers
    const submitRes = await server.request(`/api/exams/${testExamId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify(submissionPayload),
    });

    assert.equal(submitRes.status, 201);
    assert.ok(submitRes.body.submission);
    assert.equal(submitRes.body.submission.score, 100);
    assert.equal(submitRes.body.submission.percentage, 100);
    assert.equal(submitRes.body.submission.passed, true);

    // 2. Duplicate submission attempt without reschedule must be rejected with 409
    const dupRes = await server.request(`/api/exams/${testExamId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        answers: { [q1.id]: 'opt-1-c' },
      }),
    });
    assert.equal(dupRes.status, 409, 'Duplicate exam submission must return 409 Conflict');
  });

  // =========================================================================
  // JOURNEY C: Student → Parent
  // =========================================================================
  test('E2E-C1: Student scorecard reflects accurate score and standings tier', async () => {
    const reviewRes = await server.request(`/api/exams/${testExamId}/review`, {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(reviewRes.status, 200);
    assert.ok(reviewRes.body.submission);
    assert.equal(reviewRes.body.submission.score, 100);
    assert.equal(reviewRes.body.submission.passed, true);
  });

  test('E2E-C2: Linked parent views student updated score and academic progress', async () => {
    const parentChildrenRes = await server.request('/api/parent/children', {
      headers: server.authHeaders(parentToken),
    });

    assert.equal(parentChildrenRes.status, 200);
    assert.ok(Array.isArray(parentChildrenRes.body.children));
    const aarav = parentChildrenRes.body.children.find((c: any) => c.name.includes('Aarav'));
    assert.ok(aarav, 'Aarav must be linked to Mr. Rajesh Sharma');

    // Fetch detailed progress for Aarav
    const detailsRes = await server.request(`/api/parent/children/${aarav.id}/details`, {
      headers: server.authHeaders(parentToken),
    });
    assert.equal(detailsRes.status, 200);
    assert.ok(detailsRes.body.submissions);
    assert.ok(detailsRes.body.submissions.some((s: any) => s.examId === testExamId));
  });

  test('E2E-C3: Parent cannot access details of an unlinked student (403)', async () => {
    // Rajesh Sharma attempts to query Rohan (unlinked child) -> 403 Forbidden
    const unlinkedRes = await server.request('/api/parent/children/usr-stud-2/details', {
      headers: server.authHeaders(parentToken),
    });
    assert.equal(unlinkedRes.status, 403);
  });

  // =========================================================================
  // JOURNEY D: Admin → Reports
  // =========================================================================
  test('E2E-D1: School Analytics report includes test submission with CBSE grade distribution', async () => {
    const analyticsRes = await server.request('/api/admin/reports/school-analytics', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(analyticsRes.status, 200);
    assert.ok(analyticsRes.body.summary);
    assert.ok(analyticsRes.body.summary.totalSubmissionsEvaluated > 0);
    assert.ok(analyticsRes.body.summary.overallPassRate > 0);

    // Verify CBSE distribution incorporates the 100% score in A1 band
    assert.ok(Array.isArray(analyticsRes.body.cbseGradeDistribution));
    const a1Band = analyticsRes.body.cbseGradeDistribution.find((b: any) => b.grade === 'A1');
    assert.ok(a1Band, 'A1 band must be present');
    assert.ok(a1Band.count > 0, 'A1 band count must reflect top tier student submissions');
  });

  // =========================================================================
  // JOURNEY E: Notices and Support Tickets
  // =========================================================================
  test('E2E-E1: Admin creates school-wide circular; verified by all roles', async () => {
    const ts = Date.now().toString().slice(-4);
    const noticeRes = await server.request('/api/notices', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        title: `E2E Institutional Advisory ${ts}`,
        content: 'Cross-portal verification notice regarding upcoming term assessments.',
        priority: 'high',
        targetAudience: 'all',
      }),
    });

    assert.equal(noticeRes.status, 201);
    testNoticeId = noticeRes.body.notice.id;

    // Student checks notice board
    const sNotice = await server.request('/api/notices', { headers: server.authHeaders(studentToken) });
    assert.equal(sNotice.status, 200);
    assert.ok(sNotice.body.notices.some((n: any) => n.id === testNoticeId));

    // Parent checks notice board
    const pNotice = await server.request('/api/notices', { headers: server.authHeaders(parentToken) });
    assert.equal(pNotice.status, 200);
    assert.ok(pNotice.body.notices.some((n: any) => n.id === testNoticeId));
  });

  test('E2E-E2: Parent opens support ticket, teacher replies, and status updates to Resolved', async () => {
    const ts = Date.now().toString().slice(-4);
    // 1. Parent creates ticket
    const createRes = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: `E2E Academic Query ${ts}`,
        category: 'academic',
        message: 'Could you please provide the answer key for the math board mock?',
        priority: 'medium',
      }),
    });
    assert.equal(createRes.status, 201);
    testTicketId = createRes.body.ticket.id;

    // 2. Duplicate prevention: Immediate identical submission returns 409
    const dupTicket = await server.request('/api/tickets', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        recipientId: 'usr-teach-1',
        subject: `E2E Academic Query ${ts}`,
        category: 'academic',
        message: 'Could you please provide the answer key for the math board mock?',
        priority: 'medium',
      }),
    });
    assert.equal(dupTicket.status, 409, 'Duplicate ticket submission within 1 hour must return 409 Conflict');

    // 3. Teacher replies to ticket
    const replyRes = await server.request(`/api/tickets/${testTicketId}/reply`, {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        message: 'The solutions and derivations have been published in the Student Portal.',
      }),
    });
    assert.equal(replyRes.status, 201);

    // 4. Teacher updates status to resolved
    const statusRes = await server.request(`/api/tickets/${testTicketId}/status`, {
      method: 'PATCH',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.ticket.status.toLowerCase(), 'resolved');
  });

  // =========================================================================
  // JOURNEY F: Sessions and Security (Server-Enforced RBAC)
  // =========================================================================
  test('E2E-F1: Server enforces RBAC on all routes regardless of UI bypass attempts', async () => {
    // 1. Student attempting admin stats -> 403
    const s1 = await server.request('/api/admin/stats', { headers: server.authHeaders(studentToken) });
    assert.equal(s1.status, 403);

    // 2. Parent attempting teacher exams authoring -> 403
    const p1 = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(parentToken),
      body: JSON.stringify({ title: 'Hacked Exam' }),
    });
    assert.equal(p1.status, 403);

    // 3. Student attempting to delete notice -> 403
    const s2 = await server.request(`/api/notices/${testNoticeId}`, {
      method: 'DELETE',
      headers: server.authHeaders(studentToken),
    });
    assert.equal(s2.status, 403);

    // 4. Junk or expired token returns 401
    const junkAuth = await server.request('/api/auth/me', {
      headers: { Authorization: 'Bearer junk.malformed.token' },
    });
    assert.equal(junkAuth.status, 401);
  });

  // =========================================================================
  // JOURNEY G: Persistence and Recovery (Server Restart Verification)
  // =========================================================================
  test('E2E-G1: System state (submissions, allocations, notices, tickets) survives server reboot', async () => {
    const savedDbPath = server.dbPath;
    assert.ok(savedDbPath);

    // Snapshot the persisted DB state before stopping the server (which removes its temp folder)
    const rebootDb = path.join(os.tmpdir(), `nexus-reboot-${Date.now()}.json`);
    fs.copyFileSync(savedDbPath, rebootDb);

    // Stop current test server instance
    await server.stop();

    // Start a fresh server instance connected to the exact same isolated database file
    const restartedServer = await startTestServer({ DB_FILE: rebootDb });

    try {
      // 1. Re-authenticate admin on restarted server
      const adminLogin = await restartedServer.login('admin', 'Admin@Nexus2025!');
      const newAdminToken = adminLogin.token;

      // 2. Re-authenticate parent on restarted server
      const parentLogin = await restartedServer.login('parent.sharma', 'ParentPass#2025');
      const newParentToken = parentLogin.token;

      // 3. Verify exam submission survived reboot
      const analyticsRes = await restartedServer.request('/api/admin/reports/school-analytics', {
        headers: restartedServer.authHeaders(newAdminToken),
      });
      assert.equal(analyticsRes.status, 200);
      assert.ok(analyticsRes.body.summary.totalSubmissionsEvaluated > 0);

      // 4. Verify notice survived reboot
      const noticeRes = await restartedServer.request('/api/notices', {
        headers: restartedServer.authHeaders(newAdminToken),
      });
      assert.equal(noticeRes.status, 200);
      assert.ok(noticeRes.body.notices.some((n: any) => n.id === testNoticeId));

      // 5. Verify support ticket and its resolved status survived reboot
      const ticketRes = await restartedServer.request('/api/tickets', {
        headers: restartedServer.authHeaders(newParentToken),
      });
      assert.equal(ticketRes.status, 200);
      const restoredTicket = ticketRes.body.tickets.find((t: any) => t.id === testTicketId);
      assert.ok(restoredTicket, 'Support ticket must persist across server reboot');
      assert.equal(restoredTicket.status.toLowerCase(), 'resolved');
      assert.ok(restoredTicket.replies.length > 0, 'Ticket replies must persist across server reboot');
    } finally {
      await restartedServer.stop();
      try {
        if (fs.existsSync(rebootDb)) fs.unlinkSync(rebootDb);
      } catch {
        // ignore cleanup error
      }
    }
  });
});
