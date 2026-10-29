import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.js';

describe('Student Portal & Examination Workflow Suite', () => {
  let server: TestServer;
  let studentToken: string;
  let studentUser: any;
  let teacherToken: string;
  let adminToken: string;

  before(async () => {
    server = await startTestServer();

    // Authenticate Student Aarav (Class 10A)
    const studAuth = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studAuth.token;
    studentUser = studAuth.user;

    // Authenticate Teacher Sharma for exam authoring
    const teachAuth = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teachAuth.token;

    // Authenticate Admin for system-wide authoring
    const adminAuth = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminAuth.token;
  });

  after(async () => {
    await server.stop();
  });

  test('STUD-1: Student can log in and access /api/student/profile', async () => {
    const res = await server.request('/api/student/profile', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.student);
    assert.equal(res.body.student.id, studentUser.id);
    assert.equal(res.body.student.role, 'student');
  });

  test('STUD-2: Student profile returns academic standing tier and badges data', async () => {
    const res = await server.request('/api/student/profile', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.academicStanding);
    assert.ok(res.body.academicStanding.tierName || res.body.academicStanding.id);
    assert.ok(res.body.badges);
    assert.ok(Array.isArray(res.body.badges.testBadges));
    assert.ok(Array.isArray(res.body.badges.overallBadges));
  });

  test('STUD-3: Student can query /api/student/exams and receive assigned exams', async () => {
    const res = await server.request('/api/student/exams', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.exams));
  });

  test('STUD-4: Draft exams are strictly hidden from student exam feed', async () => {
    // 1. Teacher creates draft exam
    const draftRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Draft Exam Hidden From Students',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        durationMinutes: 30,
        passingScore: 50,
        status: 'draft',
        questions: [
          {
            id: 'q-hidden-1',
            text: 'Secret draft question',
            type: 'single',
            options: [{ id: 'opt-1', text: 'Answer' }],
            correctAnswer: 'opt-1',
            points: 10,
          },
        ],
      }),
    });
    assert.equal(draftRes.status, 201);
    const draftId = draftRes.body.exam.id;

    // 2. Student queries exams
    const studentRes = await server.request('/api/student/exams', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(studentRes.status, 200);
    const found = studentRes.body.exams.some((e: any) => e.id === draftId);
    assert.equal(found, false, 'Draft exam should not appear in student exams feed');
  });

  test('STUD-5: Exams for a different class (Class 9) are hidden from Class 10 student', async () => {
    // Admin creates published exam for Class 9
    const cls9Res = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        title: 'Class 9 Mathematics Quiz',
        subjectId: 'sub-phy',
        classId: 'cls-9',
        divisionId: 'all',
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [
          {
            id: 'q-c9-1',
            text: 'Class 9 question',
            type: 'single',
            options: [{ id: 'opt-1', text: 'Ans' }],
            correctAnswer: 'opt-1',
            points: 10,
          },
        ],
      }),
    });
    assert.equal(cls9Res.status, 201);
    const cls9ExamId = cls9Res.body.exam.id;

    // Class 10 student queries exams
    const studentRes = await server.request('/api/student/exams', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(studentRes.status, 200);
    const found = studentRes.body.exams.some((e: any) => e.id === cls9ExamId);
    assert.equal(found, false, 'Class 9 exam must not be visible to Class 10 student');
  });

  test('STUD-6: Question contents are stripped from /api/student/exams listing', async () => {
    const studentRes = await server.request('/api/student/exams', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(studentRes.status, 200);
    for (const exam of studentRes.body.exams) {
      assert.equal(exam.questions, undefined, 'Questions must be masked in listing');
    }
  });

  test('STUD-7: Student can access /api/exams/:id/take with correctAnswer stripped', async () => {
    // Create published exam for Class 10
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Class 10 Physics Midterm',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 45,
        passingScore: 50,
        status: 'published',
        questions: [
          {
            id: 'q-mid-1',
            text: 'State Ohm\'s Law: $V = IR$',
            type: 'single',
            options: [
              { id: 'opt-1', text: 'V = IR' },
              { id: 'opt-2', text: 'V = I/R' },
            ],
            correctAnswer: 'opt-1',
            explanation: 'Potential difference is directly proportional to current.',
            points: 10,
          },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const examId = createRes.body.exam.id;

    // Student accesses /api/exams/:id/take
    const takeRes = await server.request(`/api/exams/${examId}/take`, {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(takeRes.status, 200);
    assert.ok(takeRes.body.questions.length > 0);

    // Verify correctAnswer and explanation are stripped
    for (const q of takeRes.body.questions) {
      assert.equal(q.correctAnswer, undefined, 'correctAnswer must be stripped');
      assert.equal(q.explanation, undefined, 'explanation must be stripped');
    }
  });

  test('STUD-8: Attempting to take a draft exam returns 403', async () => {
    // Create draft exam
    const draftRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Draft Exam Blocked Test',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        durationMinutes: 30,
        passingScore: 50,
        status: 'draft',
        questions: [{ id: 'q-blk-1', text: 'Test', type: 'single', options: [], correctAnswer: 'a', points: 5 }],
      }),
    });
    const examId = draftRes.body.exam.id;

    const takeRes = await server.request(`/api/exams/${examId}/take`, {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(takeRes.status, 403);
    assert.ok(takeRes.body.error.toLowerCase().includes('draft'));
  });

  test('STUD-9: Attempting to take an expired exam returns 403', async () => {
    // Create expired exam (ended yesterday)
    const expiredRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Past Expired Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(Date.now() - 7200000).toISOString(),
        endTime: new Date(Date.now() - 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [{ id: 'q-exp-1', text: 'Expired', type: 'single', options: [], correctAnswer: 'a', points: 5 }],
      }),
    });
    assert.equal(expiredRes.status, 201);
    const examId = expiredRes.body.exam.id;

    const takeRes = await server.request(`/api/exams/${examId}/take`, {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(takeRes.status, 403);
    assert.ok(takeRes.body.error.toLowerCase().includes('expired'));
  });

  test('STUD-10: Student can autosave answers via PUT /api/exams/:id/attempt/answers', async () => {
    // Create active exam
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Autosave Probe Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [
          { id: 'q-auto-1', text: 'Sample', type: 'single', options: [{ id: 'opt-1', text: '1' }], correctAnswer: 'opt-1', points: 10 },
        ],
      }),
    });
    const examId = createRes.body.exam.id;

    // Start exam
    await server.request(`/api/exams/${examId}/take`, { headers: server.authHeaders(studentToken) });

    // Autosave answer
    const autosaveRes = await server.request(`/api/exams/${examId}/attempt/answers`, {
      method: 'PUT',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ answers: { 'q-auto-1': 'opt-1' } }),
    });
    assert.equal(autosaveRes.status, 200);
    assert.ok(autosaveRes.body.success);
  });

  test('STUD-11: Student submits exam and receives accurate auto-graded score', async () => {
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Grading Probe Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [
          { id: 'q-g1', text: 'Q1', type: 'single', options: [{ id: 'opt-1', text: 'A' }, { id: 'opt-2', text: 'B' }], correctAnswer: 'opt-1', points: 10 },
          { id: 'q-g2', text: 'Q2', type: 'single', options: [{ id: 'opt-1', text: 'A' }, { id: 'opt-2', text: 'B' }], correctAnswer: 'opt-2', points: 10 },
        ],
      }),
    });
    const examId = createRes.body.exam.id;

    // Submit with Q1 correct (+10) and Q2 incorrect (+0) -> Score 10/20 (50%)
    const submitRes = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        answers: { 'q-g1': 'opt-1', 'q-g2': 'opt-1' },
      }),
    });

    assert.equal(submitRes.status, 201);
    assert.equal(submitRes.body.score, 10);
    assert.equal(submitRes.body.totalMarks, 20);
    assert.equal(submitRes.body.percentage, 50);
    assert.equal(submitRes.body.passed, true);
  });

  test('STUD-12: Duplicate submission without reschedule returns 409 Conflict', async () => {
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Duplicate Block Probe Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [{ id: 'q-dup-1', text: 'Q', type: 'single', options: [{ id: 'opt-1', text: 'A' }], correctAnswer: 'opt-1', points: 10 }],
      }),
    });
    const examId = createRes.body.exam.id;

    // First submission
    const firstSub = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ answers: { 'q-dup-1': 'opt-1' } }),
    });
    assert.equal(firstSub.status, 201);

    // Duplicate submission attempt
    const secondSub = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ answers: { 'q-dup-1': 'opt-1' } }),
    });
    assert.equal(secondSub.status, 409);
    assert.ok(secondSub.body.error.includes('Duplicate'));
  });

  test('STUD-13: Idempotent submission replay returns 200 without duplicate grading', async () => {
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Idempotency Probe Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [{ id: 'q-idemp-1', text: 'Q', type: 'single', options: [{ id: 'opt-1', text: 'A' }], correctAnswer: 'opt-1', points: 10 }],
      }),
    });
    const examId = createRes.body.exam.id;
    const idempKey = `idemp_test_key_${Date.now()}`;

    // First submission with Idempotency-Key
    const firstSub = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: {
        ...server.authHeaders(studentToken),
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({ answers: { 'q-idemp-1': 'opt-1' }, idempotencyKey: idempKey }),
    });
    assert.equal(firstSub.status, 201);

    // Replayed network submission with same Idempotency-Key
    const replaySub = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: {
        ...server.authHeaders(studentToken),
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({ answers: { 'q-idemp-1': 'opt-1' }, idempotencyKey: idempKey }),
    });
    assert.equal(replaySub.status, 200);
    assert.ok(replaySub.body.idempotentReplay);
    assert.equal(replaySub.body.score, firstSub.body.score);
  });

  test('STUD-14: Student can review submitted exam score summary via /api/exams/:id/review', async () => {
    const now = new Date();
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Review Probe Exam',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        startTime: new Date(now.getTime() - 60000).toISOString(),
        endTime: new Date(now.getTime() + 3600000).toISOString(),
        durationMinutes: 30,
        passingScore: 50,
        status: 'published',
        questions: [{ id: 'q-rev-1', text: 'Q', type: 'single', options: [{ id: 'opt-1', text: 'A' }], correctAnswer: 'opt-1', points: 10 }],
      }),
    });
    const examId = createRes.body.exam.id;

    await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ answers: { 'q-rev-1': 'opt-1' } }),
    });

    const revRes = await server.request(`/api/exams/${examId}/review`, {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(revRes.status, 200);
    assert.ok(revRes.body.summary);
    assert.equal(revRes.body.summary.score, 10);
  });

  test('STUD-15: Student role restrictions: Student cannot access teacher/admin endpoints', async () => {
    const teacherExams = await server.request('/api/teacher/exams', { headers: server.authHeaders(studentToken) });
    assert.equal(teacherExams.status, 403);

    const questionBank = await server.request('/api/teacher/question-bank', { headers: server.authHeaders(studentToken) });
    assert.equal(questionBank.status, 403);

    const credentials = await server.request('/api/admin/credentials', { headers: server.authHeaders(studentToken) });
    assert.equal(credentials.status, 403);
  });

  test('STUD-16: Student can fetch curriculum study materials via /api/materials', async () => {
    const matRes = await server.request('/api/materials', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(matRes.status, 200);
    assert.ok(Array.isArray(matRes.body.materials));
  });
});
