import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isCommit = process.argv.includes('--commit');
const jsonPath = path.resolve(__dirname, '../data/nexus_school_db.json');

if (!fs.existsSync(jsonPath)) {
  console.error(`[Importer] Error: JSON state file not found at ${jsonPath}`);
  process.exit(1);
}

const rawData = fs.readFileSync(jsonPath, 'utf8');
const data = JSON.parse(rawData);

// Extract parsed entities and mapped child tables
const academicYears = Array.isArray(data.academicYears) ? data.academicYears : [];
const classes = Array.isArray(data.classes) ? data.classes : [];
const divisions = Array.isArray(data.divisions) ? data.divisions : [];
const subjects = Array.isArray(data.subjects) ? data.subjects : [];
const classSubjects = Array.isArray(data.classSubjects) ? data.classSubjects : [];
const users = Array.isArray(data.users) ? data.users : [];
const questionBank = Array.isArray(data.questionBank) ? data.questionBank : [];
const loginAudits = Array.isArray(data.loginAudits) ? data.loginAudits : [];
const cheatingAudits = Array.isArray(data.cheatingAudits) ? data.cheatingAudits : [];
const deletedCredentialAudits = Array.isArray(data.deletedCredentialAudits) ? data.deletedCredentialAudits : [];
const schoolNotices = Array.isArray(data.schoolNotices) ? data.schoolNotices : [];
const appNotifications = Array.isArray(data.appNotifications) ? data.appNotifications : [];
const exams = Array.isArray(data.exams) ? data.exams : [];
const submissions = Array.isArray(data.submissions) ? data.submissions : [];
const studyMaterials = Array.isArray(data.studyMaterials) ? data.studyMaterials : [];
const supportTickets = Array.isArray(data.supportTickets) ? data.supportTickets : [];
const examAttempts = Array.isArray(data.examAttempts) ? data.examAttempts : [];

// Mapped relations
const teacherAssignments: Array<{ teacherId: string; classId: string; divisionId: string; subjectId: string }> = [];
const parentStudents: Array<{ parentId: string; studentId: string }> = [];

for (const u of users) {
  if (Array.isArray(u.assignedSubjects)) {
    for (const asgn of u.assignedSubjects) {
      if (asgn.classId && asgn.divisionId && asgn.subjectId) {
        teacherAssignments.push({
          teacherId: u.id,
          classId: asgn.classId,
          divisionId: asgn.divisionId,
          subjectId: asgn.subjectId
        });
      }
    }
  }
  if (Array.isArray(u.childrenIds)) {
    for (const childId of u.childrenIds) {
      parentStudents.push({ parentId: u.id, studentId: childId });
    }
  }
  if (u.parentId && u.role === 'student') {
    parentStudents.push({ parentId: u.parentId, studentId: u.id });
  }
}

// Deduplicate parentStudents
const uniqueParentStudents = Array.from(
  new Map(parentStudents.map((ps) => [`${ps.parentId}:${ps.studentId}`, ps])).values()
);

// Flatten exam questions
const examQuestions: any[] = [];
for (const ex of exams) {
  if (Array.isArray(ex.questions)) {
    ex.questions.forEach((q: any, idx: number) => {
      examQuestions.push({
        ...q,
        examId: ex.id,
        orderSeq: idx
      });
    });
  }
}

// Flatten ticket replies
const ticketReplies: any[] = [];
for (const t of supportTickets) {
  if (Array.isArray(t.replies)) {
    for (const r of t.replies) {
      ticketReplies.push({
        ...r,
        ticketId: t.id
      });
    }
  }
}

// Notification reads
const notificationReads: any[] = [];
for (const notif of appNotifications) {
  if (notif.read && notif.targetUserId) {
    notificationReads.push({
      notificationId: notif.id,
      userId: notif.targetUserId
    });
  }
}

// Settings items
const settingsItems: Array<{ key: string; value: any }> = [];
if (data.academicConfig) {
  settingsItems.push({ key: 'academic_config', value: data.academicConfig });
}
if (data.schoolProfile) {
  settingsItems.push({ key: 'school_profile', value: data.schoolProfile });
}

const entityCounts = {
  academic_years: academicYears.length,
  classes: classes.length,
  divisions: divisions.length,
  subjects: subjects.length,
  class_subjects: classSubjects.length,
  users: users.length,
  teacher_assignments: teacherAssignments.length,
  parent_students: uniqueParentStudents.length,
  exams: exams.length,
  exam_questions: examQuestions.length,
  question_bank: questionBank.length,
  exam_attempts: examAttempts.length,
  submissions: submissions.length,
  cheating_events: cheatingAudits.length,
  login_audits: loginAudits.length,
  deletion_audits: deletedCredentialAudits.length,
  notices: schoolNotices.length,
  notifications: appNotifications.length,
  notification_reads: notificationReads.length,
  study_materials: studyMaterials.length,
  support_tickets: supportTickets.length,
  ticket_replies: ticketReplies.length,
  settings: settingsItems.length
};

async function getDatabaseCounts(client: pg.PoolClient | pg.Pool): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of Object.keys(entityCounts)) {
    try {
      const res = await client.query(`SELECT COUNT(*)::int as count FROM ${table};`);
      counts[table] = res.rows[0].count;
    } catch {
      counts[table] = -1; // table might not exist yet
    }
  }
  return counts;
}

async function main() {
  console.log('====================================================');
  console.log(` Nexus School DB -> PostgreSQL Importer`);
  console.log(` Source file: ${jsonPath}`);
  console.log(` Execution Mode: ${isCommit ? 'COMMIT (Writes to Database)' : 'DRY-RUN (Simulated)'}`);
  console.log('====================================================\n');

  const DATABASE_URL = process.env.DATABASE_URL;
  let pool: pg.Pool | null = null;
  let preCounts: Record<string, number> = {};

  if (DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('supabase.co')
        ? { rejectUnauthorized: false }
        : undefined
    });
    try {
      preCounts = await getDatabaseCounts(pool);
    } catch (e: any) {
      console.warn(`[DB Notice] Could not read existing database counts: ${e.message}`);
    }
  }

  console.log('Parsed JSON Table Counts:');
  console.log('----------------------------------------------------');
  for (const [table, count] of Object.entries(entityCounts)) {
    const dbCountStr = preCounts[table] !== undefined ? ` | DB Before: ${preCounts[table]}` : '';
    console.log(` - ${table.padEnd(24)}: ${count.toString().padStart(4)} records${dbCountStr}`);
  }
  console.log('----------------------------------------------------\n');

  if (!isCommit) {
    console.log('[DRY-RUN] No rows were written to the database.');
    console.log('[DRY-RUN] To perform the actual import, run:');
    console.log('          npx tsx scripts/import-legacy-json.ts --commit\n');
    if (pool) await pool.end();
    return;
  }

  if (!pool) {
    console.error('[Importer] Fatal: DATABASE_URL is required to perform --commit.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log('[Importer] Starting commit transaction...');
    await client.query('BEGIN');

    // 1. Academic Years
    for (const ay of academicYears) {
      await client.query(
        `INSERT INTO academic_years (id, name, is_current)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING;`,
        [ay.id, ay.name, !!ay.isCurrent]
      );
    }

    // 2. Classes
    for (const c of classes) {
      await client.query(
        `INSERT INTO classes (id, name, level, archived)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING;`,
        [c.id, c.name, Number(c.level) || 1, !!c.archived]
      );
    }

    // 3. Divisions
    for (const d of divisions) {
      await client.query(
        `INSERT INTO divisions (id, class_id, name, room_number, archived)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING;`,
        [d.id, d.classId, d.name, d.roomNumber || null, !!d.archived]
      );
    }

    // 4. Subjects
    for (const s of subjects) {
      await client.query(
        `INSERT INTO subjects (id, name, code, icon)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING;`,
        [s.id, s.name, s.code, s.icon || null]
      );
    }

    // 5. Class Subjects Mapping
    for (const cs of classSubjects) {
      await client.query(
        `INSERT INTO class_subjects (class_id, subject_id)
         VALUES ($1, $2)
         ON CONFLICT (class_id, subject_id) DO NOTHING;`,
        [cs.classId, cs.subjectId]
      );
    }

    // 6. Users
    for (const u of users) {
      let pwdHash = u.password || '';
      let mustChange = u.mustChangePassword ?? true;
      if (!pwdHash.startsWith('$2a$') && !pwdHash.startsWith('$2b$')) {
        pwdHash = bcrypt.hashSync(pwdHash || 'DefaultPass#123', 10);
        mustChange = true;
      }

      await client.query(
        `INSERT INTO users (
           id, role, name, username, email, phone, password_hash,
           must_change_password, class_id, division_id, roll_no,
           employee_id, parent_id, bonus_points, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING;`,
        [
          u.id,
          u.role,
          u.name,
          u.username,
          u.email || null,
          u.phone || null,
          pwdHash,
          mustChange,
          u.classId || null,
          u.divisionId || null,
          u.rollNo || null,
          u.employeeId || null,
          u.parentId || null,
          Number(u.bonusPoints) || 0,
          u.createdAt ? new Date(u.createdAt) : new Date()
        ]
      );
    }

    // 7. Teacher Assignments
    for (const ta of teacherAssignments) {
      await client.query(
        `INSERT INTO teacher_assignments (teacher_id, class_id, division_id, subject_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (teacher_id, class_id, division_id, subject_id) DO NOTHING;`,
        [ta.teacherId, ta.classId, ta.divisionId, ta.subjectId]
      );
    }

    // 8. Parent Students Mapping
    for (const ps of uniqueParentStudents) {
      await client.query(
        `INSERT INTO parent_students (parent_id, student_id)
         VALUES ($1, $2)
         ON CONFLICT (parent_id, student_id) DO NOTHING;`,
        [ps.parentId, ps.studentId]
      );
    }

    // 9. Exams
    for (const ex of exams) {
      await client.query(
        `INSERT INTO exams (
           id, title, description, subject_id, subject_name,
           class_id, class_name, division_id, division_name,
           target_class_id, target_division_id, teacher_id, teacher_name,
           status, start_time, end_time, duration_minutes,
           passing_score, total_marks, question_count, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         ON CONFLICT (id) DO NOTHING;`,
        [
          ex.id,
          ex.title,
          ex.description || null,
          ex.subjectId,
          ex.subjectName || null,
          ex.classId,
          ex.className || null,
          ex.divisionId,
          ex.divisionName || null,
          ex.targetClassId || null,
          ex.targetDivisionId || null,
          ex.teacherId,
          ex.teacherName || null,
          ex.status || 'draft',
          ex.startTime ? new Date(ex.startTime) : new Date(),
          ex.endTime ? new Date(ex.endTime) : new Date(Date.now() + 86400000),
          Number(ex.durationMinutes) || 30,
          Number(ex.passingScore) || 50,
          Number(ex.totalMarks) || 0,
          Number(ex.questionCount) || (ex.questions?.length || 0),
          ex.createdAt ? new Date(ex.createdAt) : new Date()
        ]
      );
    }

    // 10. Exam Questions
    for (const eq of examQuestions) {
      await client.query(
        `INSERT INTO exam_questions (
           id, exam_id, text, type, options, correct_answer, explanation,
           points, image_url, subject_id, class_id, chapter_name,
           in_question_bank, order_seq, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING;`,
        [
          eq.id,
          eq.examId,
          eq.text,
          eq.type || 'single',
          JSON.stringify(eq.options || []),
          JSON.stringify(eq.correctAnswer !== undefined ? eq.correctAnswer : null),
          eq.explanation || null,
          Number(eq.points) || 1,
          eq.imageUrl || null,
          eq.subjectId || null,
          eq.classId || null,
          eq.chapterName || null,
          !!eq.inQuestionBank,
          Number(eq.orderSeq) || 0,
          new Date()
        ]
      );
    }

    // 11. Question Bank
    for (const q of questionBank) {
      await client.query(
        `INSERT INTO question_bank (
           id, text, type, options, correct_answer, explanation,
           points, image_url, subject_id, class_id, chapter_name,
           in_question_bank, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING;`,
        [
          q.id,
          q.text,
          q.type || 'single',
          JSON.stringify(q.options || []),
          JSON.stringify(q.correctAnswer !== undefined ? q.correctAnswer : null),
          q.explanation || null,
          Number(q.points) || 1,
          q.imageUrl || null,
          q.subjectId || null,
          q.classId || null,
          q.chapterName || null,
          q.inQuestionBank !== false,
          new Date()
        ]
      );
    }

    // 12. Exam Attempts
    for (const ea of examAttempts) {
      await client.query(
        `INSERT INTO exam_attempts (id, exam_id, student_id, started_at, attempt_no)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (exam_id, student_id, attempt_no) DO NOTHING;`,
        [ea.id, ea.examId, ea.studentId, ea.startedAt ? new Date(ea.startedAt) : new Date(), Number(ea.attemptNo) || 1]
      );
    }

    // 13. Submissions
    for (const sub of submissions) {
      const totalMarks = Math.max(Number(sub.totalMarks) || 1, 1);
      const percentage = Math.min(Math.max(Number(sub.percentage) || 0, 0), 100);

      await client.query(
        `INSERT INTO submissions (
           id, exam_id, student_id, attempt_no, answers, score,
           total_marks, percentage, passed, bonus_points_awarded,
           cheating_flagged, cheating_details, time_spent_minutes,
           submitted_at, voided_at, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (exam_id, student_id, attempt_no) DO NOTHING;`,
        [
          sub.id,
          sub.examId,
          sub.studentId,
          Number(sub.attemptNo) || 1,
          JSON.stringify(sub.answers || {}),
          Number(sub.score) || 0,
          totalMarks,
          percentage,
          !!sub.passed,
          Number(sub.bonusPointsAwarded) || 0,
          !!sub.cheatingFlagged,
          sub.cheatingDetails ? JSON.stringify(sub.cheatingDetails) : null,
          sub.timeSpentMinutes ? Number(sub.timeSpentMinutes) : null,
          sub.submittedAt ? new Date(sub.submittedAt) : new Date(),
          sub.rescheduled ? new Date() : null,
          sub.idempotencyKey || null
        ]
      );
    }

    // 14. Cheating Events
    for (const ca of cheatingAudits) {
      await client.query(
        `INSERT INTO cheating_events (
           id, timestamp, student_id, student_name, student_roll_no,
           exam_id, exam_title, violation_count, action_taken, details, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING;`,
        [
          ca.id,
          ca.timestamp ? new Date(ca.timestamp) : new Date(),
          ca.studentId,
          ca.studentName,
          ca.studentRollNo || null,
          ca.examId,
          ca.examTitle,
          Number(ca.violationCount) || 1,
          ca.actionTaken,
          ca.details || null,
          ca.timestamp ? new Date(ca.timestamp) : new Date()
        ]
      );
    }

    // 15. Login Audits
    for (const la of loginAudits) {
      await client.query(
        `INSERT INTO login_audits (
           id, timestamp, user_id, user_name, email, role,
           identifier, ip_address, user_agent, status, failure_reason, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING;`,
        [
          la.id,
          la.timestamp ? new Date(la.timestamp) : new Date(),
          la.userId || null,
          la.userName,
          la.email || null,
          la.role,
          la.identifier,
          la.ipAddress || '127.0.0.1',
          la.userAgent || 'Legacy Importer',
          la.status || 'Success',
          la.failureReason || null,
          la.timestamp ? new Date(la.timestamp) : new Date()
        ]
      );
    }

    // 16. Deletion Audits
    for (const da of deletedCredentialAudits) {
      await client.query(
        `INSERT INTO deletion_audits (
           id, timestamp, deleted_user_id, deleted_user_name, deleted_user_email,
           deleted_role, role, identifier, deleted_by, deleted_by_admin_name, reason, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING;`,
        [
          da.id,
          da.timestamp ? new Date(da.timestamp) : new Date(),
          da.deletedUserId,
          da.deletedUserName,
          da.deletedUserEmail || null,
          da.deletedRole || da.role,
          da.role,
          da.identifier,
          da.deletedBy,
          da.deletedByAdminName || da.deletedBy,
          da.reason || null,
          da.timestamp ? new Date(da.timestamp) : new Date()
        ]
      );
    }

    // 17. School Notices
    for (const sn of schoolNotices) {
      await client.query(
        `INSERT INTO notices (
           id, title, content, category, target_audience,
           author_id, author_name, author_role, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING;`,
        [
          sn.id,
          sn.title,
          sn.content,
          sn.category,
          sn.targetAudience || 'All',
          sn.authorId || null,
          sn.authorName,
          sn.authorRole,
          sn.createdAt ? new Date(sn.createdAt) : new Date()
        ]
      );
    }

    // 18. Notifications
    for (const notif of appNotifications) {
      await client.query(
        `INSERT INTO notifications (
           id, title, message, category, target_role,
           target_user_id, link_tab, link_id, metadata, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING;`,
        [
          notif.id,
          notif.title,
          notif.message,
          notif.category,
          notif.targetRole || 'all',
          notif.targetUserId || null,
          notif.linkTab || null,
          notif.linkId || null,
          JSON.stringify(notif.metadata || {}),
          notif.timestamp ? new Date(notif.timestamp) : new Date()
        ]
      );
    }

    // 19. Notification Reads
    for (const nr of notificationReads) {
      await client.query(
        `INSERT INTO notification_reads (notification_id, user_id, read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (notification_id, user_id) DO NOTHING;`,
        [nr.notificationId, nr.userId]
      );
    }

    // 20. Study Materials
    for (const sm of studyMaterials) {
      await client.query(
        `INSERT INTO study_materials (
           id, title, description, subject_id, subject_name,
           class_id, class_name, division_id, division_name,
           teacher_id, teacher_name, type, url, file_name, file_size, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING;`,
        [
          sm.id,
          sm.title,
          sm.description || null,
          sm.subjectId,
          sm.subjectName || null,
          sm.classId,
          sm.className || null,
          sm.divisionId,
          sm.divisionName || null,
          sm.teacherId,
          sm.teacherName || null,
          sm.type,
          sm.url,
          sm.fileName || null,
          sm.fileSize || null,
          sm.createdAt ? new Date(sm.createdAt) : new Date()
        ]
      );
    }

    // 21. Support Tickets
    for (const st of supportTickets) {
      await client.query(
        `INSERT INTO support_tickets (
           id, parent_id, parent_name, student_id, student_name, student_class,
           recipient_id, recipient_name, recipient_role, subject, category,
           message, status, priority, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING;`,
        [
          st.id,
          st.parentId,
          st.parentName,
          st.studentId,
          st.studentName,
          st.studentClass || null,
          st.recipientId || null,
          st.recipientName || null,
          st.recipientRole || null,
          st.subject,
          st.category,
          st.message,
          st.status || 'Open',
          st.priority || 'medium',
          st.createdAt ? new Date(st.createdAt) : new Date(),
          st.updatedAt ? new Date(st.updatedAt) : new Date()
        ]
      );
    }

    // 22. Ticket Replies
    for (const tr of ticketReplies) {
      await client.query(
        `INSERT INTO ticket_replies (id, ticket_id, sender_id, sender_name, sender_role, message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING;`,
        [
          tr.id,
          tr.ticketId,
          tr.senderId,
          tr.senderName,
          tr.senderRole,
          tr.message,
          tr.timestamp ? new Date(tr.timestamp) : new Date()
        ]
      );
    }

    // 23. Settings
    for (const item of settingsItems) {
      await client.query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();`,
        [item.key, JSON.stringify(item.value)]
      );
    }

    await client.query('COMMIT');
    console.log('[Importer] Successfully committed transaction!');

    const postCounts = await getDatabaseCounts(client);
    console.log('\nPost-Import Reconciliation Table:');
    console.log('--------------------------------------------------------------------------------');
    console.log('Table Name'.padEnd(25) + 'JSON Records'.padStart(14) + 'DB Before'.padStart(14) + 'DB After'.padStart(14) + 'Net Change'.padStart(13));
    console.log('--------------------------------------------------------------------------------');
    for (const [table, jsonCount] of Object.entries(entityCounts)) {
      const before = preCounts[table] || 0;
      const after = postCounts[table] || 0;
      const diff = after - before;
      console.log(
        table.padEnd(25) +
        jsonCount.toString().padStart(14) +
        before.toString().padStart(14) +
        after.toString().padStart(14) +
        (`+${diff}`).padStart(13)
      );
    }
    console.log('--------------------------------------------------------------------------------\n');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[Importer] Fatal error during import transaction:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('[Importer] Unhandled execution error:', e);
  process.exit(1);
});
