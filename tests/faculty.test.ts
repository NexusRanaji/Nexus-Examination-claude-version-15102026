import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Faculty Portal & Exam Workflow Suite', () => {
  let server: TestServer;
  let teacherToken: string;
  let teacher2Token: string;
  let adminToken: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();
    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    const teacher2Login = await server.login('teacher.meera', 'NexusTeacher#2025');
    teacher2Token = teacher2Login.token;

    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('FAC-1: Teacher can view question bank', async () => {
    const res = await server.request('/api/teacher/question-bank', {
      headers: server.authHeaders(teacherToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.questions));
    assert.ok(res.body.pagination);
  });

  test('FAC-2: Student cannot view question bank (403)', async () => {
    const res = await server.request('/api/teacher/question-bank', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 403);
  });

  test('FAC-3: Teacher can create a single-choice question', async () => {
    const questionData = {
      text: 'What is the SI unit of electric current?',
      type: 'single',
      options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
      correctAnswer: 'Ampere',
      explanation: 'Ampere is the base unit of electric current in the International System of Units.',
      points: 5,
      subjectId: 'sub-phy',
      classId: 'cls-10',
      chapterName: 'Electricity',
    };

    const res = await server.request('/api/teacher/question-bank', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(questionData),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.question);
    assert.equal(res.body.question.text, questionData.text);
    assert.equal(res.body.question.points, 5);
  });

  test('FAC-4: Teacher can create a true/false question', async () => {
    const tfQuestion = {
      text: 'Light travels faster in water than in air.',
      type: 'true-false',
      options: ['True', 'False'],
      correctAnswer: 'False',
      explanation: 'Light travels faster in less dense mediums like vacuum or air compared to water.',
      points: 2,
      subjectId: 'sub-phy',
      classId: 'cls-10',
      chapterName: 'Optics & Light',
    };

    const res = await server.request('/api/teacher/question-bank', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(tfQuestion),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.question.correctAnswer, 'False');
  });

  test('FAC-5: Reject question creation with missing required fields', async () => {
    const invalidQ = {
      type: 'single',
      points: 10,
    };

    const res = await server.request('/api/teacher/question-bank', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(invalidQ),
    });

    assert.equal(res.status, 400);
  });

  test('FAC-6: Teacher can delete a question from the bank', async () => {
    // Create a temporary question
    const createRes = await server.request('/api/teacher/question-bank', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        text: 'Temporary Question for Deletion Test',
        type: 'single',
        options: ['Option 1', 'Option 2'],
        correctAnswer: 'Option 1',
        points: 1,
      }),
    });
    assert.equal(createRes.status, 201);
    const qId = createRes.body.question.id;

    // Delete question
    const delRes = await server.request(`/api/teacher/question-bank/${qId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(delRes.status, 200);
  });

  test('FAC-7: Teacher can bulk upload questions and optionally schedule exam', async () => {
    const bulkData = {
      questions: [
        {
          text: 'What is Ohm’s law?',
          type: 'single',
          options: ['V = IR', 'V = I/R', 'V = I^2 R', 'V = R/I'],
          correctAnswer: 'V = IR',
          points: 5,
        },
        {
          text: 'What is the chemical formula of common salt?',
          type: 'single',
          options: ['NaCl', 'KCl', 'CaCO3', 'NaOH'],
          correctAnswer: 'NaCl',
          points: 5,
        },
      ],
      autoScheduleExam: true,
      examDetails: {
        title: 'Weekly Physics & Chemistry Assessment',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        durationMinutes: 45,
        passingScore: 50,
      },
    };

    const res = await server.request('/api/teacher/bulk-questions', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(bulkData),
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.questionsImported, 2);
    assert.ok(res.body.exam);
    assert.equal(res.body.exam.title, bulkData.examDetails.title);
  });

  test('FAC-8: Teacher can create, publish, and delete an exam', async () => {
    const examData = {
      title: 'Term 1 Science Milestone',
      description: 'Comprehensive mid-term evaluation covering Units 1-4',
      subjectId: 'sub-phy',
      classId: 'cls-10',
      durationMinutes: 60,
      passingScore: 40,
      questions: [
        {
          id: 'q-demo-1',
          text: 'What is acceleration due to gravity on Earth?',
          type: 'single',
          options: ['9.8 m/s²', '8.9 m/s²', '10.8 m/s²', '11.2 m/s²'],
          correctAnswer: '9.8 m/s²',
          points: 10,
        },
      ],
    };

    // 1. Create
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(examData),
    });
    assert.equal(createRes.status, 201);
    const examId = createRes.body.exam.id;
    assert.equal(createRes.body.exam.status, 'draft');

    // 2. Publish
    const publishRes = await server.request(`/api/teacher/exams/${examId}/publish`, {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(publishRes.status, 200);
    assert.equal(publishRes.body.exam.status, 'published');

    // 3. Delete
    const delRes = await server.request(`/api/teacher/exams/${examId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(delRes.status, 200);
  });

  test('FAC-9: Teacher can fetch exam submissions', async () => {
    const res = await server.request('/api/teacher/submissions', {
      headers: server.authHeaders(teacherToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.submissions));
  });

  test('FAC-10: Cross-teacher exam isolation: Teacher cannot edit or delete another teacher\'s exam (403)', async () => {
    // 1. Teacher 1 creates an exam
    const createRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        title: 'Teacher Sharma Private Physics Assessment',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        durationMinutes: 30,
        passingScore: 50,
      }),
    });
    assert.equal(createRes.status, 201);
    const examId = createRes.body.exam.id;

    // 2. Teacher 2 tries to update it -> must be rejected with 403
    const updateRes = await server.request(`/api/teacher/exams/${examId}`, {
      method: 'PUT',
      headers: server.authHeaders(teacher2Token),
      body: JSON.stringify({ title: 'Hijacked Title by Teacher 2' }),
    });
    assert.equal(updateRes.status, 403);

    // 3. Teacher 2 tries to delete it -> must be rejected with 403
    const deleteRes = await server.request(`/api/teacher/exams/${examId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacher2Token),
    });
    assert.equal(deleteRes.status, 403);

    // Clean up with Teacher 1
    await server.request(`/api/teacher/exams/${examId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken),
    });
  });

  test('FAC-11: Teacher can create question with LaTeX mathematical expressions', async () => {
    const mathQuestion = {
      text: 'Evaluate the integral: $\\int_{0}^{\\pi} \\sin(x) \\, dx$',
      type: 'single',
      options: ['$0$', '$1$', '$2$', '$-1$'],
      correctAnswer: '$2$',
      explanation: '$\\int_{0}^{\\pi} \\sin(x) \\, dx = [-\\cos(x)]_{0}^{\\pi} = -(-1) - (-1) = 2$.',
      points: 5,
      subjectId: 'sub-math',
      classId: 'cls-10',
      chapterName: 'Calculus & Integration',
    };

    const res = await server.request('/api/teacher/question-bank', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(mathQuestion),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.question.id);
    assert.equal(res.body.question.text, mathQuestion.text);
    assert.equal(res.body.question.correctAnswer, '$2$');
  });

  test('FAC-12: Teacher can filter question bank by class and subject', async () => {
    const res = await server.request('/api/teacher/question-bank?classId=cls-10&subjectId=sub-phy', {
      headers: server.authHeaders(teacherToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.questions));
    for (const q of res.body.questions) {
      assert.equal(q.classId, 'cls-10');
      assert.equal(q.subjectId, 'sub-phy');
    }
  });

  test('FAC-13: Full student exam submission, auto-grading, and teacher review workflow', async () => {
    // 1. Teacher creates and publishes exam
    const examData = {
      title: 'Grading Engine Verification Exam',
      subjectId: 'sub-phy',
      classId: 'cls-10',
      divisionId: 'div-10a',
      durationMinutes: 30,
      passingScore: 50,
      questions: [
        {
          id: 'q-grade-1',
          text: 'What is the unit of resistance?',
          type: 'single',
          options: [
            { id: 'opt-ohm', text: 'Ohm' },
            { id: 'opt-farad', text: 'Farad' },
          ],
          correctAnswer: 'opt-ohm',
          points: 10,
        },
      ],
    };

    const examRes = await server.request('/api/teacher/exams', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(examData),
    });
    assert.equal(examRes.status, 201);
    const examId = examRes.body.exam.id;

    await server.request(`/api/teacher/exams/${examId}/publish`, {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
    });

    // 2. Student submits exam
    const submitRes = await server.request(`/api/exams/${examId}/submit`, {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        answers: { 'q-grade-1': 'opt-ohm' },
        timeSpentSeconds: 180,
        integrityMetrics: { blurCount: 0, tabSwitches: 0 },
      }),
    });
    assert.equal(submitRes.status, 201);
    assert.equal(submitRes.body.submission.score, 10);
    assert.equal(submitRes.body.submission.passed, true);
    const subId = submitRes.body.submission.id;

    // 3. Teacher reviews submission in teacher submissions feed
    const teacherSubs = await server.request('/api/teacher/submissions', {
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(teacherSubs.status, 200);
    const reviewTarget = teacherSubs.body.submissions.find((s: any) => s.id === subId);
    assert.ok(reviewTarget, 'Teacher should find student submission');
    assert.equal(reviewTarget.score, 10);
    assert.equal(reviewTarget.cheatingFlagged, false);

    // 4. Clean up
    await server.request(`/api/teacher/exams/${examId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken),
    });
  });

  test('FAC-14: Teacher can authorize student exam reschedule', async () => {
    const res = await server.request('/api/teacher/reschedule', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        studentId: 'usr-stud-1',
        examId: 'exam-cls10-phy1',
        reason: 'Legitimate medical leave documented',
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.message);
  });

  test('FAC-15: Teacher can upload, list, and delete study materials', async () => {
    const matPayload = {
      title: 'SSC Board Sample Papers Physics',
      description: 'Solved questions for chapter 1 to 5',
      subjectId: 'sub-phy',
      classId: 'cls-10',
      divisionId: 'div-10a',
      type: 'link',
      url: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800',
    };

    // Create
    const createRes = await server.request('/api/teacher/materials', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify(matPayload),
    });
    assert.equal(createRes.status, 201);
    const matId = createRes.body.material.id;

    // Delete
    const delRes = await server.request(`/api/teacher/materials/${matId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(delRes.status, 200);
  });

  test('FAC-16: Teacher can access academic rules and standings configuration', async () => {
    const rulesRes = await server.request('/api/teacher/academic-rules', {
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(rulesRes.status, 200);
    assert.ok(rulesRes.body.config, 'Academic rules config object should exist');

    const standingsRes = await server.request('/api/teacher/student-standings', {
      headers: server.authHeaders(teacherToken),
    });
    assert.equal(standingsRes.status, 200);
    assert.ok(standingsRes.body);
  });
});
