import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool, saveStateToPostgres } from '../server/db.ts';

const DB_FILE = path.join(process.cwd(), 'data', 'nexus_school_db.json');

async function cleanData() {
  console.log('Cleaning data/nexus_school_db.json...');
  const current = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

  const cleanUsers = [
    {
      id: 'usr-admin',
      name: 'Super Administrator',
      username: 'admin',
      email: 'admin@nexusrana.edu',
      role: 'superadmin',
      employeeId: 'NRES-DIR-001',
      phone: '+91 98201 11000',
      password: bcrypt.hashSync('Admin@Nexus2026', 10),
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-teacher-demo',
      name: 'Faculty Teacher',
      username: 'teacher.demo',
      email: 'teacher.demo@nexusrana.edu',
      role: 'teacher',
      employeeId: 'NRES-FAC-101',
      phone: '+91 98201 22334',
      assignedSubjects: [
        {
          classId: 'cls-10',
          divisionId: 'div-10a',
          subjectId: 'sub-phy'
        },
        {
          classId: 'cls-10',
          divisionId: 'div-10a',
          subjectId: 'sub-math'
        }
      ],
      password: bcrypt.hashSync('Teacher@Nexus2026', 10),
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-parent-demo',
      name: 'Demo Parent',
      username: 'parent.demo',
      email: 'parent.demo@nexusrana.edu',
      role: 'parent',
      phone: '+91 98201 44521',
      childrenIds: ['usr-student-demo'],
      password: bcrypt.hashSync('Parent@Nexus2026', 10),
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'usr-student-demo',
      name: 'Demo Student',
      username: 'student.demo',
      email: 'student.demo@student.nexusrana.edu',
      role: 'student',
      rollNo: '1',
      classId: 'cls-10',
      divisionId: 'div-10a',
      parentId: 'usr-parent-demo',
      phone: '+91 98201 44521',
      bonusPoints: 100,
      password: bcrypt.hashSync('Student@Nexus2026', 10),
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ];

  const cleanedDb = {
    ...current,
    users: cleanUsers,
    exams: [],
    submissions: [],
    examAttempts: [],
    schoolNotices: [],
    cheatingAudits: [],
    questionBank: [],
    studyMaterials: [],
    supportTickets: [],
    loginAudits: [],
    deletedCredentialAudits: [],
    appNotifications: []
  };

  fs.writeFileSync(DB_FILE, JSON.stringify(cleanedDb, null, 2), 'utf8');
  console.log('✅ Local data/nexus_school_db.json cleaned.');

  console.log('Syncing clean state to Supabase PostgreSQL nexus_system_state...');
  const success = await saveStateToPostgres(cleanedDb);
  console.log('✅ Supabase PostgreSQL nexus_system_state synced:', success);

  await pool.end();
}

cleanData().catch((err) => {
  console.error(err);
  process.exit(1);
});

