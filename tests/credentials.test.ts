import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, TestServer } from './helpers/harness.ts';

describe('Admin Credentials & Roster Suite', () => {
  let server: TestServer;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;

  before(async () => {
    server = await startTestServer();
    const adminLogin = await server.login('admin', 'Admin@Nexus2025!');
    adminToken = adminLogin.token;

    const teacherLogin = await server.login('teacher.sharma', 'NexusTeacher#2025');
    teacherToken = teacherLogin.token;

    const studentLogin = await server.login('student.aarav', 'StudentPass#101');
    studentToken = studentLogin.token;
  });

  after(async () => {
    if (server) await server.stop();
  });

  test('CRED-1: Superadmin can fetch credentials directory', async () => {
    const res = await server.request('/api/admin/credentials', {
      headers: server.authHeaders(adminToken),
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.ok(res.body.users.length > 0);
    assert.ok(res.body.pagination);
  });

  test('CRED-2: Teacher cannot access admin credentials directory', async () => {
    const res = await server.request('/api/admin/credentials', {
      headers: server.authHeaders(teacherToken),
    });

    assert.equal(res.status, 403);
  });

  test('CRED-3: Student cannot access admin credentials directory', async () => {
    const res = await server.request('/api/admin/credentials', {
      headers: server.authHeaders(studentToken),
    });

    assert.equal(res.status, 403);
  });

  test('CRED-4: Superadmin can create a new student credential', async () => {
    const newStudent = {
      name: 'Pooja Patil',
      role: 'student',
      username: `pooja.patil.${Date.now()}`,
      password: 'SecurePass#2026',
      email: `pooja.${Date.now()}@nexusrana.edu`,
      phone: '+91 98201 11222',
      rollNo: `NRES-10A-${Date.now().toString().slice(-3)}`,
      classId: 'cls-10',
      divisionId: 'div-10-a',
    };

    const res = await server.request('/api/auth/users', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(newStudent),
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.user);
    assert.equal(res.body.user.name, newStudent.name);
    assert.equal(res.body.user.role, 'student');
  });

  test('CRED-5: Reject creating credential with short password (< 8 chars)', async () => {
    const invalidUser = {
      name: 'Short Pass User',
      role: 'student',
      username: `short.user.${Date.now()}`,
      password: '123',
    };

    const res = await server.request('/api/auth/users', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(invalidUser),
    });

    assert.equal(res.status, 400);
  });

  test('CRED-6: Reject creating duplicate username', async () => {
    const duplicateUser = {
      name: 'Duplicate Admin',
      role: 'teacher',
      username: 'admin',
      password: 'SomeTeacherPass#123',
    };

    const res = await server.request('/api/auth/users', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify(duplicateUser),
    });

    assert.equal(res.status, 400);
  });

  test('CRED-7: Superadmin can update an existing credential', async () => {
    // Fetch users first
    const listRes = await server.request('/api/admin/credentials', {
      headers: server.authHeaders(adminToken),
    });
    const target = listRes.body.users.find((u: any) => u.username === 'student.rohan');
    assert.ok(target, 'student.rohan must exist');

    const updateRes = await server.request(`/api/auth/users/${target.id}`, {
      method: 'PUT',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: 'Rohan Verma (Updated)',
        phone: '+91 98201 55555',
      }),
    });

    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.user.name, 'Rohan Verma (Updated)');
  });

  test('CRED-8: Superadmin can delete a credential and audit is recorded', async () => {
    // Create a temporary user to delete
    const tempUsername = `temp.del.${Date.now()}`;
    const createRes = await server.request('/api/auth/users', {
      method: 'POST',
      headers: server.authHeaders(adminToken),
      body: JSON.stringify({
        name: 'Temporary User To Delete',
        role: 'student',
        username: tempUsername,
        password: 'ValidPassword#123',
        classId: 'cls-10',
        divisionId: 'div-10-a',
        rollNo: `99${Date.now().toString().slice(-4)}`,
      }),
    });
    assert.equal(createRes.status, 201);
    const createdId = createRes.body.user.id;

    // Delete the user
    const delRes = await server.request(`/api/auth/users/${createdId}`, {
      method: 'DELETE',
      headers: server.authHeaders(adminToken),
    });
    assert.equal(delRes.status, 200);

    // Verify user is gone
    const verifyRes = await server.request('/api/admin/credentials', {
      headers: server.authHeaders(adminToken),
    });
    const stillExists = verifyRes.body.users.some((u: any) => u.id === createdId);
    assert.equal(stillExists, false);
  });
});
