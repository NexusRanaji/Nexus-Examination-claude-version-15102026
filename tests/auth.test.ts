import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import { startTestServer, TestServer } from './helpers/harness.ts';

const BURNED_OLD_SECRET = 'nexus_super_secret_jwt_key_at_least_32_characters_long_2025_prod_secure';

describe('Authentication & Security Suite', () => {
  let server: TestServer;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('AUTH-1: Superadmin login with valid credentials succeeds', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'Admin@Nexus2025!' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'Token must be provided on login');
    assert.equal(res.body.user.role, 'superadmin');
    assert.equal(res.body.user.username, 'admin');
    assert.equal(res.body.user.password, undefined, 'Password hash must never be in public user');
    assert.equal(res.body.user.rawPassword, undefined, 'Plain password must never be in public user');
  });

  test('AUTH-2: Student login with roll number and password succeeds', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'student.aarav', password: 'StudentPass#101' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'student');
  });

  test('AUTH-3: Teacher login with username and password succeeds', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'teacher.sharma', password: 'NexusTeacher#2025' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'teacher');
  });

  test('AUTH-4: Parent login with username and password succeeds', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'parent.sharma', password: 'ParentPass#2025' }),
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, 'parent');
  });

  test('AUTH-5: Invalid password returns 401 and generic error', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin', password: 'CompletelyWrongPassword123!' }),
    });

    assert.equal(res.status, 401);
    assert.ok(res.body.error);
  });

  test('FP-AUTH-S4: Rejected login never alters or overwrites stored password hash', async () => {
    // Read state file before failed login
    const beforeRaw = fs.readFileSync(server.dbPath, 'utf-8');
    const beforeDb = JSON.parse(beforeRaw);
    const targetUserBefore = beforeDb.users.find((u: any) => u.username === 'student.rohan');
    assert.ok(targetUserBefore, 'student.rohan must exist');
    const hashBefore = targetUserBefore.password;

    // Attempt failed login with arbitrary password
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'student.rohan', password: 'AttackerAttemptedPassword#999' }),
    });
    assert.equal(res.status, 401);

    // Read state file after failed login
    const afterRaw = fs.readFileSync(server.dbPath, 'utf-8');
    const afterDb = JSON.parse(afterRaw);
    const targetUserAfter = afterDb.users.find((u: any) => u.username === 'student.rohan');

    assert.equal(targetUserAfter.password, hashBefore, 'Password hash must remain exactly unchanged on failed login');
  });

  test('AUTH-6: Protected endpoint /api/auth/me returns current user with valid token', async () => {
    const { token, user } = await server.login('admin', 'Admin@Nexus2025!');
    const res = await server.request('/api/auth/me', {
      headers: server.authHeaders(token),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, user.id);
    assert.equal(res.body.user.role, 'superadmin');
  });

  test('AUTH-7: Protected endpoint without Authorization header returns 401', async () => {
    const res = await server.request('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('AUTH-8: Token signed with old burned JWT secret is strictly rejected', async () => {
    const forgedToken = jwt.sign({ sub: 'usr-admin-1', role: 'superadmin' }, BURNED_OLD_SECRET, { expiresIn: '1h' });
    const res = await server.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${forgedToken}`,
      },
    });

    assert.equal(res.status, 401, 'Forged token with old burned secret must be rejected');
  });

  test('AUTH-9: Malformed or junk JWT token returns 401', async () => {
    const res = await server.request('/api/auth/me', {
      headers: {
        Authorization: 'Bearer this-is-not-a-valid-jwt-token-string',
      },
    });

    assert.equal(res.status, 401);
  });

  test('AUTH-10: Password change succeeds with valid credentials and minimum 8 chars', async () => {
    const { token } = await server.login('student.aarav', 'StudentPass#101');
    const newPass = 'AaravNewPassword2026!';

    const changeRes = await server.request('/api/auth/change-password', {
      method: 'POST',
      headers: server.authHeaders(token),
      body: JSON.stringify({
        currentPassword: 'StudentPass#101',
        newPassword: newPass,
      }),
    });

    assert.equal(changeRes.status, 200);

    // Old password must now fail
    const oldLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'student.aarav', password: 'StudentPass#101' }),
    });
    assert.equal(oldLogin.status, 401);

    // New password must succeed
    const newLogin = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'student.aarav', password: newPass }),
    });
    assert.equal(newLogin.status, 200);
  });

  test('AUTH-11: Password change rejected if new password is under 8 characters', async () => {
    const { token } = await server.login('teacher.meera', 'NexusTeacher#2025');

    const changeRes = await server.request('/api/auth/change-password', {
      method: 'POST',
      headers: server.authHeaders(token),
      body: JSON.stringify({
        currentPassword: 'NexusTeacher#2025',
        newPassword: 'short',
      }),
    });

    assert.equal(changeRes.status, 400);
  });
  test('AUTH-12: Email format validation rejects malformed email strings with 400', async () => {
    // Malformed email in identifier
    const res1 = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'matlavaishnavi123@', password: 'AnyPassword123!' }),
    });
    assert.equal(res1.status, 400);
    assert.match(res1.body.error, /invalid email format/i);

    // Malformed explicit email field
    const res2 = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'AnyPassword123!' }),
    });
    assert.equal(res2.status, 400);
    assert.match(res2.body.error, /invalid email format/i);
  });

  test('AUTH-13: Plain string matching email prefix is not treated as email and fails with 401', async () => {
    // A string like 'matlavaishnavi123' must not match 'matlavaishnavi123@nexus.edu' or 'matlavaishnavi123@gmail.com'
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'matlavaishnavi123', password: 'StudentPass#101' }),
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /invalid institutional credentials/i);
  });

  test('AUTH-14: Standard valid email login succeeds with proper password', async () => {
    // Admin by full email
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@nexusrana.edu', password: 'Admin@Nexus2025!' }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'admin@nexusrana.edu');
  });

  test('AUTH-15: Non-email identifier (username, roll number) succeeds without email requirement', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'student.rohan', password: 'StudentPass#101' }),
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });
});
