import 'dotenv/config';
import http from 'http';

// Configure test port before loading server
process.env.PORT = '3099';
process.env.NODE_ENV = 'production';

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path: string, options: { method?: string; body?: any; token?: string } = {}) {
  const url = `http://127.0.0.1:3099${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, ok: res.ok, data };
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('NEXUS EXAMINATION SYSTEM - PRODUCTION VERIFICATION');
  console.log('====================================================\n');

  console.log('[1/8] Starting server on port 3099...');
  // Import server module dynamically so it binds to port 3099
  await import('../server.ts');
  await wait(2500);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, details?: any) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`, details || '');
      failed++;
    }
  }

  // ----------------------------------------------------
  // TEST GROUP 1: PUBLIC DIRECTORY PROTECTION
  // ----------------------------------------------------
  console.log('\n[2/8] Testing Public Directory & Endpoint Security...');
  const pubUsers = await request('/api/auth/public-users');
  assert(
    pubUsers.status === 200 && Array.isArray(pubUsers.data?.users) && pubUsers.data.users.length === 0,
    'GET /api/auth/public-users returns empty list (zero user enumeration)',
    pubUsers.data
  );

  const dbConnectAttempt = await request('/api/database/connect', { method: 'POST', body: { url: 'fake' } });
  assert(
    dbConnectAttempt.status === 403,
    'POST /api/database/connect is locked down / returns 403 Forbidden',
    dbConnectAttempt.status
  );

  // ----------------------------------------------------
  // TEST GROUP 2: AUTHENTICATION FOR ALL 4 ROLES
  // ----------------------------------------------------
  console.log('\n[3/8] Testing Authentication for the 4 Official Accounts...');

  const loginAdmin = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'admin', password: 'Admin@Nexus2026' }
  });
  assert(loginAdmin.status === 200 && loginAdmin.data?.user?.role === 'superadmin', 'Superadmin login succeeds', loginAdmin.data);
  const adminToken = loginAdmin.data?.token;

  const loginTeacher = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'teacher.demo', password: 'Teacher@Nexus2026' }
  });
  assert(loginTeacher.status === 200 && loginTeacher.data?.user?.role === 'teacher', 'Teacher login succeeds', loginTeacher.data);
  const teacherToken = loginTeacher.data?.token;

  const loginParent = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'parent.demo', password: 'Parent@Nexus2026' }
  });
  assert(loginParent.status === 200 && loginParent.data?.user?.role === 'parent', 'Parent login succeeds', loginParent.data);
  const parentToken = loginParent.data?.token;

  const loginStudent = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'student.demo', password: 'Student@Nexus2026' }
  });
  assert(loginStudent.status === 200 && loginStudent.data?.user?.role === 'student', 'Student login succeeds', loginStudent.data);
  const studentToken = loginStudent.data?.token;

  // ----------------------------------------------------
  // TEST GROUP 3: STRICT PASSWORD REJECTION (ZERO BACKDOORS)
  // ----------------------------------------------------
  console.log('\n[4/8] Testing Password Security & Backdoor Elimination...');

  const wrongPass = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'admin', password: 'IncorrectPassword!999' }
  });
  assert(wrongPass.status === 401, 'Rejects wrong password for admin', wrongPass.status);

  const oldPass = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'admin', password: 'Admin@Nexus2025!' }
  });
  assert(oldPass.status === 401, 'Rejects legacy Admin@Nexus2025! password', oldPass.status);

  const defaultRolePass = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'student.demo', password: 'School@123' }
  });
  assert(defaultRolePass.status === 401, 'Rejects fallback/demo password School@123', defaultRolePass.status);

  const nonExistent = await request('/api/auth/login', {
    method: 'POST',
    body: { identifier: 'evaluator.backdoor', password: 'any' }
  });
  assert(nonExistent.status === 401, 'Rejects non-existent / evaluator backdoors', nonExistent.status);

  // Test /api/auth/me for each user
  const meAdmin = await request('/api/auth/me', { token: adminToken });
  assert(meAdmin.status === 200 && meAdmin.data?.user?.username === 'admin', 'GET /api/auth/me verifies superadmin profile');

  const meStudent = await request('/api/auth/me', { token: studentToken });
  assert(meStudent.status === 200 && meStudent.data?.user?.username === 'student.demo', 'GET /api/auth/me verifies student profile');

  // ----------------------------------------------------
  // TEST GROUP 4: CREDENTIAL CREATION & BULK UPLOAD RULES
  // ----------------------------------------------------
  console.log('\n[5/8] Testing Credential Management & Bulk Upload Rules...');

  const runSuffix = Date.now();

  // Single Teacher creation (must NOT require class/division)
  const teacherCredRes = await request('/api/admin/create-credential', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Test Science Teacher',
      email: `science.teacher.${runSuffix}@nexus.edu`,
      role: 'teacher',
      password: 'Teacher@Password2026',
    }
  });
  assert(teacherCredRes.status === 201, 'Creates Teacher credential without requiring class/division', teacherCredRes.data);
  const createdTeacherId = teacherCredRes.data?.user?.id;

  // Single Parent creation (must NOT require class/division)
  const parentCredRes = await request('/api/admin/create-credential', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Test Parent Guardian',
      email: `parent.guardian.${runSuffix}@nexus.edu`,
      role: 'parent',
      password: 'Parent@Password2026',
    }
  });
  assert(parentCredRes.status === 201, 'Creates Parent credential without requiring class/division', parentCredRes.data);
  const createdParentId = parentCredRes.data?.user?.id;

  // Single Student creation without class (MUST fail)
  const studentMissingClass = await request('/api/admin/create-credential', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Invalid Student No Class',
      email: `noclass.student.${runSuffix}@nexus.edu`,
      role: 'student',
      password: 'Student@Password2026',
    }
  });
  assert(studentMissingClass.status === 400, 'Rejects Student credential missing classId (enforces student validation)', studentMissingClass.data);

  // Single Student creation with class & division (MUST succeed)
  const studentValid = await request('/api/admin/create-credential', {
    method: 'POST',
    token: adminToken,
    body: {
      name: 'Valid Student SSC',
      email: `valid.student.${runSuffix}@nexus.edu`,
      role: 'student',
      classId: 'cls-10',
      divisionId: 'div-10a',
      rollNo: '99',
      password: 'Student@Password2026',
    }
  });
  assert(studentValid.status === 201, 'Creates Student credential with valid class and division', studentValid.data);
  const createdStudentId = studentValid.data?.user?.id;

  // Bulk Upload endpoint test
  const bulkRes = await request('/api/admin/credentials/bulk', {
    method: 'POST',
    token: adminToken,
    body: {
      credentials: [
        {
          name: 'Bulk Teacher A',
          email: 'bulk.teacher.a@nexus.edu',
          role: 'teacher',
          password: 'Password@2026',
        },
        {
          name: 'Bulk Parent B',
          email: 'bulk.parent.b@nexus.edu',
          role: 'parent',
          password: 'Password@2026',
        },
        {
          name: 'Bulk Student C',
          email: 'bulk.student.c@nexus.edu',
          role: 'student',
          className: 'Standard 10 (SSC)',
          classId: 'cls-10',
          divisionName: 'Division A',
          divisionId: 'div-10a',
          rollNo: '88',
          password: 'Password@2026',
        }
      ]
    }
  });
  assert((bulkRes.status === 200 || bulkRes.status === 201) && (bulkRes.data?.users?.length === 3 || bulkRes.data?.importedCount === 3), 'Bulk upload processes mixed roles successfully without forcing class on staff', bulkRes.data);

  // ----------------------------------------------------
  // TEST GROUP 5: TEACHER EXAM CREATION & SCHEDULING
  // ----------------------------------------------------
  console.log('\n[6/8] Testing Teacher Examination Management...');

  const examPayload = {
    title: 'SSC Term 1 Science & Mathematics',
    description: 'Comprehensive evaluation for Class 10 Division A',
    classId: 'cls-10',
    divisionId: 'div-10a',
    subjectId: 'sub-phy',
    durationMinutes: 45,
    passingScore: 50,
    startTime: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // active now
    endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),   // closes in 1 hour
    status: 'published',
    questions: [
      {
        id: 'q-test-1',
        type: 'single',
        text: 'What is the SI unit of Electric Current?',
        options: [
          { id: 'opt-a', text: 'Volt' },
          { id: 'opt-b', text: 'Ampere' },
          { id: 'opt-c', text: 'Ohm' },
          { id: 'opt-d', text: 'Joule' }
        ],
        correctAnswer: 'opt-b',
        points: 5
      },
      {
        id: 'q-test-2',
        type: 'true_false',
        text: 'Light travels faster in water than in a vacuum.',
        options: [
          { id: 'true', text: 'True' },
          { id: 'false', text: 'False' }
        ],
        correctAnswer: 'false',
        points: 5
      }
    ]
  };

  const createExamRes = await request('/api/teacher/exams', {
    method: 'POST',
    token: teacherToken,
    body: examPayload
  });
  assert(createExamRes.status === 201, 'Teacher creates exam for assigned Class 10A', createExamRes.data);
  const examId = createExamRes.data?.exam?.id || createExamRes.data?.id;

  // Publish exam if not published
  const publishRes = await request(`/api/teacher/exams/${examId}/publish`, {
    method: 'POST',
    token: teacherToken
  });
  assert(publishRes.status === 200, 'Teacher publishes examination', publishRes.data);

  // ----------------------------------------------------
  // TEST GROUP 6: STUDENT EXAM TAKING, AUTOSAVE & SUBMIT
  // ----------------------------------------------------
  console.log('\n[7/8] Testing Student Exam Taking, Autosave & Auto-Grading...');

  const studentExamsRes = await request('/api/student/exams', { token: studentToken });
  const hasPublishedExam = (studentExamsRes.data?.exams || studentExamsRes.data || []).some((e: any) => e.id === examId);
  assert(studentExamsRes.status === 200 && hasPublishedExam, 'Student sees published exam in examination schedule');

  const takeExamRes = await request(`/api/exams/${examId}/take`, { token: studentToken });
  assert(takeExamRes.status === 200 && takeExamRes.data?.exam?.questions?.length === 2, 'Student enters secure exam environment with questions loaded');

  // Autosave answers
  const autosaveRes = await request(`/api/exams/${examId}/attempt/answers`, {
    method: 'PUT',
    token: studentToken,
    body: {
      answers: { 'q-test-1': 'opt-b' }
    }
  });
  assert(autosaveRes.status === 200, 'Autosave answers endpoint preserves student progress in-flight');

  // Submit with perfect answers (10/10 points = 100%)
  const submitRes = await request(`/api/exams/${examId}/submit`, {
    method: 'POST',
    token: studentToken,
    body: {
      answers: {
        'q-test-1': 'opt-b',
        'q-test-2': 'false'
      },
      cheatingLog: {
        violationCount: 0,
        cheatingFlagged: false
      }
    }
  });
  assert(
    submitRes.status === 201 &&
    submitRes.data?.score === 10 &&
    submitRes.data?.percentage === 100 &&
    submitRes.data?.passed === true &&
    submitRes.data?.result?.cheatingFlagged === false,
    'Auto-grading computes perfect 100% score for correct answers',
    submitRes.data
  );

  // Duplicate submission check
  const duplicateSubmit = await request(`/api/exams/${examId}/submit`, {
    method: 'POST',
    token: studentToken,
    body: {
      answers: { 'q-test-1': 'opt-b' }
    }
  });
  assert(duplicateSubmit.status === 409, 'Rejects duplicate exam submissions with 409 Conflict', duplicateSubmit.status);

  // Review submission
  const reviewRes = await request(`/api/exams/${examId}/review`, { token: studentToken });
  assert(reviewRes.status === 200 && reviewRes.data?.submission?.score === 10, 'Student reviews finalized submission');

  // ----------------------------------------------------
  // TEST GROUP 7: PARENT CHILD MONITORING & RESULTS
  // ----------------------------------------------------
  console.log('\n[8/8] Testing Parent Child Progress & Audit Logs...');

  const parentChildrenRes = await request('/api/parent/children', { token: parentToken });
  const children = parentChildrenRes.data?.children || parentChildrenRes.data || [];
  assert(
    parentChildrenRes.status === 200 && children.some((c: any) => c.id === 'usr-student-demo'),
    'Parent dashboard lists linked student (usr-student-demo)',
    children
  );

  const childResultsRes = await request('/api/parent/child/usr-student-demo/results', { token: parentToken });
  const submissions = childResultsRes.data?.submissions || childResultsRes.data || [];
  assert(
    childResultsRes.status === 200 && submissions.length > 0,
    'Parent accesses real-time graded examination report for student',
    submissions
  );

  // Clean up test credentials
  if (createdTeacherId) await request(`/api/admin/credentials/${createdTeacherId}`, { method: 'DELETE', token: adminToken });
  if (createdParentId) await request(`/api/admin/credentials/${createdParentId}`, { method: 'DELETE', token: adminToken });
  if (createdStudentId) await request(`/api/admin/credentials/${createdStudentId}`, { method: 'DELETE', token: adminToken });
  const bulkCreated = bulkRes.data?.users || bulkRes.data?.created || [];
  for (const bUser of bulkCreated) {
    if (bUser.id) await request(`/api/admin/credentials/${bUser.id}`, { method: 'DELETE', token: adminToken });
  }
  await request(`/api/teacher/exams/${examId}`, { method: 'DELETE', token: teacherToken });

  console.log('\n====================================================');
  console.log(`TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed === 0) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED! THE APPLICATION IS PRODUCTION READY.');
    process.exit(0);
  } else {
    console.error(`💥 ${failed} test(s) failed.`);
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
