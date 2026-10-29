import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Security Hardening & Remediation Suite (Phase 5)', () => {
  let server: TestServer;
  let adminToken: string;
  let teacherToken1: string;
  let teacherToken2: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();

    // Authenticate primary superadmin (Dr. R. K. Deshmukh)
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    // Authenticate Teacher 1 (teacher.sharma)
    const t1Login = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken1 = t1Login.token;

    // Authenticate Teacher 2 (teacher.meera)
    const t2Login = await server.login('teacher.meera', 'NexusTeacher#2025');
    teacherToken2 = t2Login.token;

    // Authenticate Student (student.aarav)
    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  // =========================================================================
  // CRITICAL-01: Database Administration Endpoints Protection & Credential Privacy
  // =========================================================================

  test('SEC-CRIT-01A: Database status endpoint rejects unauthenticated requests with 401', async () => {
    const res = await server.request('/api/database/status');
    assert.equal(res.status, 401, 'Unauthenticated access to /api/database/status must return 401');
  });

  test('SEC-CRIT-01B: Database status endpoint rejects non-superadmin roles with 403', async () => {
    const teacherRes = await server.request('/api/database/status', {
      headers: server.authHeaders(teacherToken1),
    });
    assert.equal(teacherRes.status, 403, 'Teacher must be forbidden from database status');

    const studentRes = await server.request('/api/database/status', {
      headers: server.authHeaders(studentToken),
    });
    assert.equal(studentRes.status, 403, 'Student must be forbidden from database status');
  });

  test('SEC-CRIT-01C: Database status succeeds for superadmin without leaking raw credentials', async () => {
    const res = await server.request('/api/database/status', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.configured === 'boolean');
    assert.ok(typeof res.body.healthy === 'boolean');
    // Ensure no raw passwords, connection URIs, or tokens are exposed
    const text = JSON.stringify(res.body);
    assert.equal(text.includes('postgresql://'), false, 'Response must not contain raw postgresql URI');
    assert.equal(text.includes('password='), false, 'Response must not contain password params');
  });

  test('SEC-CRIT-01D: Database connect, sync, and migrations endpoints require superadmin role', async () => {
    const unauthConnect = await server.request('/api/database/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ databaseUrl: 'postgresql://test:test@localhost:5432/db' }),
    });
    assert.equal(unauthConnect.status, 401);

    const teacherSync = await server.request('/api/database/sync', {
      method: 'POST',
      headers: server.authHeaders(teacherToken1),
    });
    assert.equal(teacherSync.status, 403);

    const studentMigrate = await server.request('/api/database/run-migrations', {
      method: 'POST',
      headers: server.authHeaders(studentToken),
    });
    assert.equal(studentMigrate.status, 403);
  });

  // =========================================================================
  // CRITICAL-02: Backdoor Removal & Uniform Rate Limiting
  // =========================================================================

  test('SEC-CRIT-02A: Backdoor user theoneandonlyking999 is purged and cannot authenticate', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'theoneandonlyking999',
        password: 'Admin@Nexus2025!',
      }),
    });
    assert.equal(res.status, 401, 'Backdoor username must fail authentication');
    assert.equal(res.body.error, 'Invalid institutional credentials');
  });

  test('SEC-CRIT-02B: Login rate limiting is uniformly enforced without bypass keywords', async () => {
    const probeIdentifier = `king_probe_${Date.now()}`;
    // Fire 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: probeIdentifier,
          password: 'WrongPassword#999',
        }),
      });
      assert.equal(res.status, 401, `Attempt ${i + 1} should be 401`);
    }

    // 6th attempt with probe keyword must be blocked by rate limiter (429)
    const limitedRes = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: probeIdentifier,
        password: 'WrongPassword#999',
      }),
    });
    assert.equal(limitedRes.status, 429, '6th attempt must be rate limited with 429');
    assert.ok(limitedRes.body.error.includes('Too many failed login attempts'));
  });

  // =========================================================================
  // HIGH-01: CORS Allowlist Protection
  // =========================================================================

  test('SEC-HIGH-01A: Permitted local origin receives CORS allow headers with credentials', async () => {
    const res = await server.request('/healthz', {
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  });

  test('SEC-HIGH-01B: Untrusted origin is denied CORS headers', async () => {
    const res = await server.request('/healthz', {
      headers: {
        Origin: 'https://evil-untrusted-domain.com',
      },
    });
    assert.equal(res.status, 200);
    assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil-untrusted-domain.com');
  });

  // =========================================================================
  // HIGH-02: Plaintext Credentials Redacted from Admin APIs
  // =========================================================================

  test('SEC-HIGH-02A: /api/auth/users redacts password and rawPassword from all records', async () => {
    const res = await server.request('/api/auth/users?limit=2000', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length > 0);
    for (const u of res.body.users) {
      assert.strictEqual(u.password, undefined, `User ${u.username} must not expose password`);
      assert.strictEqual(u.rawPassword, undefined, `User ${u.username} must not expose rawPassword`);
    }
  });

  test('SEC-HIGH-02B: /api/admin/credentials redacts password and rawPassword from all records', async () => {
    const res = await server.request('/api/admin/credentials?limit=2000', {
      headers: server.authHeaders(adminToken),
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length > 0);
    for (const u of res.body.users) {
      assert.strictEqual(u.password, undefined, `User ${u.username} must not expose password`);
      assert.strictEqual(u.rawPassword, undefined, `User ${u.username} must not expose rawPassword`);
    }
  });

  // =========================================================================
  // HIGH-03: Study Material Ownership Enforcement
  // =========================================================================

  test('SEC-HIGH-03A: Teacher cannot delete study materials created by another teacher', async () => {
    // Teacher 1 creates a study material
    const createRes = await server.request('/api/teacher/materials', {
      method: 'POST',
      headers: server.authHeaders(teacherToken1),
      body: JSON.stringify({
        title: 'Teacher 1 Physics Notes',
        description: 'Kinematics formulas',
        subjectId: 'sub-phy',
        classId: 'cls-10',
        divisionId: 'div-10a',
        type: 'link',
        url: 'https://example.com/notes.pdf',
      }),
    });
    assert.equal(createRes.status, 201);
    const materialId = createRes.body.material.id;

    // Teacher 2 attempts to delete Teacher 1's material -> must return 403 Forbidden
    const unauthDelRes = await server.request(`/api/teacher/materials/${materialId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken2),
    });
    assert.equal(unauthDelRes.status, 403, 'Cross-teacher material deletion must be rejected with 403');
    assert.ok(unauthDelRes.body.error.includes('only delete your own'));

    // Teacher 1 deletes their own material -> must succeed with 200 OK
    const ownerDelRes = await server.request(`/api/teacher/materials/${materialId}`, {
      method: 'DELETE',
      headers: server.authHeaders(teacherToken1),
    });
    assert.equal(ownerDelRes.status, 200, 'Owner teacher must be able to delete their material');
  });

  test('SEC-HIGH-03B: Superadmin retains authority to delete study materials from any teacher', async () => {
    // Teacher 2 creates a study material
    const createRes = await server.request('/api/teacher/materials', {
      method: 'POST',
      headers: server.authHeaders(teacherToken2),
      body: JSON.stringify({
        title: 'Teacher 2 Chemistry Notes',
        description: 'Periodic table review',
        subjectId: 'sub-chem',
        classId: 'cls-10',
        divisionId: 'div-10a',
        type: 'link',
        url: 'https://example.com/chemistry.pdf',
      }),
    });
    assert.equal(createRes.status, 201);
    const materialId = createRes.body.material.id;

    // Superadmin deletes Teacher 2's material -> must succeed with 200 OK
    const adminDelRes = await server.request(`/api/teacher/materials/${materialId}`, {
      method: 'DELETE',
      headers: server.authHeaders(adminToken),
    });
    assert.equal(adminDelRes.status, 200, 'Superadmin must be allowed to delete any study material');
  });
});
