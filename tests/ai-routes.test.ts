import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('AI Educational Services Suite', () => {
  let server: TestServer;
  let studentToken: string;
  let teacherToken: string;

  before(async () => {
    server = await startTestServer();
    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;

    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('AI-1: /api/ai/chat/config is accessible and reports model availability', async () => {
    const res = await server.request('/api/ai/chat/config');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.roles));
  });

  test('AI-2: Unauthenticated request to /api/ai/threads is rejected with 401', async () => {
    const res = await server.request('/api/ai/threads');
    assert.equal(res.status, 401);
  });

  test('AI-3: Student can create and retrieve AI tutor threads', async () => {
    // Create thread
    const createRes = await server.request('/api/ai/threads', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({ title: 'Physics Revision: Newton Laws' }),
    });

    assert.equal(createRes.status, 201);
    assert.ok(createRes.body.thread);
    const threadId = createRes.body.thread.id;

    // Retrieve thread list
    const listRes = await server.request('/api/ai/threads', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.threads));
    const exists = listRes.body.threads.some((t: any) => t.id === threadId);
    assert.equal(exists, true);
  });

  test('AI-4: Student cannot generate teacher quiz (/api/ai/generate-quiz returns 403)', async () => {
    const res = await server.request('/api/ai/generate-quiz', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        topic: 'Photosynthesis',
        classId: 'cls-10',
        questionCount: 5,
      }),
    });

    assert.equal(res.status, 403);
  });

  test('AI-5: Teacher can invoke quiz generation endpoint', async () => {
    const res = await server.request('/api/ai/generate-quiz', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        topic: 'Optics and Reflection',
        classId: 'cls-10',
        questionCount: 3,
        difficulty: 'medium',
      }),
    });

    // If Gemini key is mock/unconfigured, server returns either 200 with generated/fallback questions or 503
    assert.ok(res.status === 200 || res.status === 503 || res.status === 400);
  });
  test('AI-6: Quiz generator produces 10 completely unique questions with distinct options', async () => {
    const res = await server.request('/api/ai/generate-quiz', {
      method: 'POST',
      headers: server.authHeaders(teacherToken),
      body: JSON.stringify({
        topic: 'Carbon and its Compounds',
        chapterName: 'Carbon and its Compounds',
        subject: 'Science',
        classGrade: 'Class 10',
        educationalBoard: 'CBSE',
        difficultyLevel: 'Mixed',
        totalQuestions: 10,
        questionCount: 10,
      }),
    });

    assert.equal(res.status, 200);
    const questions = res.body.quiz?.questions || res.body.questions;
    assert.ok(Array.isArray(questions), 'Must return questions array');
    assert.equal(questions.length, 10, 'Must generate exactly 10 questions');

    const questionTexts = questions.map((q: any) => q.questionText || q.text);
    const uniqueTexts = new Set(questionTexts);
    assert.equal(uniqueTexts.size, 10, 'All 10 questions must have distinct question text');

    // Verify option uniqueness and correct answers
    const optionSets = new Set();
    for (const q of questions) {
      assert.equal(q.options.length, 4, 'Each question must have exactly 4 options');
      const uniqueOpts = new Set(q.options);
      assert.equal(uniqueOpts.size, 4, 'Each question options must be unique');
      assert.ok(q.correctAnswer >= 0 && q.correctAnswer <= 3, 'correctAnswer must be in [0..3]');
      optionSets.add(q.options.join(' | '));
    }
    assert.equal(optionSets.size, 10, 'Every question must have a distinct set of options');
  });

  test('AI-7: Study query regarding diamond allotrope is not falsely blocked as non-study', async () => {
    const res = await server.request('/api/ai/chat', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        message: 'Explain why diamond is an allotrope of carbon in chemistry',
        roleId: 'academic_tutor',
      }),
    });

    assert.equal(res.status, 200);
    assert.notEqual(res.body.modelUsed, 'policy-guardrail', 'Academic diamond query must not trigger policy-guardrail');
  });

  test('AI-8: Multi-turn chat returns transparent unconfigured-offline status when keys are unavailable', async () => {
    const res = await server.request('/api/ai/chat', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
      body: JSON.stringify({
        message: 'What are Newton laws of motion?',
        roleId: 'stem_specialist',
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.reply.length > 0);
    // If running in offline test environment, modelUsed reports honest offline status
    assert.ok(res.body.modelUsed === 'unconfigured-offline' || res.body.modelUsed.includes('gemini'));
  });
});
