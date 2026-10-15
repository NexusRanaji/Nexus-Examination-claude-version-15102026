-- Migration 001: Initial PostgreSQL Schema for Nexus School Platform
-- Applied via scripts/migrate.ts

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User Role Enum
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('superadmin', 'teacher', 'student', 'parent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Academic Years
CREATE TABLE IF NOT EXISTS academic_years (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Classes
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  level INT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Divisions
CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_number TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Class Subjects Mapping
CREATE TABLE IF NOT EXISTS class_subjects (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, subject_id)
);

-- 6. Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  role user_role NOT NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  class_id TEXT REFERENCES classes(id),
  division_id TEXT REFERENCES divisions(id),
  roll_no TEXT,
  employee_id TEXT,
  parent_id TEXT REFERENCES users(id),
  bonus_points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS students_roll_uq ON users (class_id, division_id, roll_no) WHERE role='student' AND deleted_at IS NULL;

-- 7. Teacher Assignments
CREATE TABLE IF NOT EXISTS teacher_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  division_id TEXT NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id, division_id, subject_id)
);

-- 8. Parent Students Mapping
CREATE TABLE IF NOT EXISTS parent_students (
  parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, student_id)
);

-- 9. Exams
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  subject_name TEXT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  class_name TEXT,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  division_name TEXT,
  target_class_id TEXT,
  target_division_id TEXT,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  teacher_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed', 'archived')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 50,
  total_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
  question_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS exams_class_div_status_idx ON exams (class_id, division_id, status) WHERE deleted_at IS NULL;

-- 10. Exam Questions
CREATE TABLE IF NOT EXISTS exam_questions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'multi', 'true_false')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer JSONB NOT NULL,
  explanation TEXT,
  points NUMERIC(8,2) NOT NULL DEFAULT 1,
  image_url TEXT,
  subject_id TEXT REFERENCES subjects(id),
  class_id TEXT REFERENCES classes(id),
  chapter_name TEXT,
  in_question_bank BOOLEAN NOT NULL DEFAULT false,
  order_seq INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS exam_questions_exam_id_idx ON exam_questions (exam_id) WHERE deleted_at IS NULL;

-- 11. Question Bank
CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  text TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('single', 'multi', 'true_false')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer JSONB NOT NULL,
  explanation TEXT,
  points NUMERIC(8,2) NOT NULL DEFAULT 1,
  image_url TEXT,
  subject_id TEXT REFERENCES subjects(id),
  class_id TEXT REFERENCES classes(id),
  chapter_name TEXT,
  in_question_bank BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 12. Exam Attempts
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_no INT NOT NULL DEFAULT 1,
  UNIQUE (exam_id, student_id, attempt_no)
);

-- 13. Submissions
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attempt_no INT NOT NULL DEFAULT 1,
  answers JSONB NOT NULL,
  score NUMERIC(8,2) NOT NULL,
  total_marks NUMERIC(8,2) NOT NULL CHECK (total_marks > 0),
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
  passed BOOLEAN NOT NULL,
  bonus_points_awarded INT NOT NULL DEFAULT 0,
  cheating_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  cheating_details JSONB,
  time_spent_minutes NUMERIC(8,2),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  voided_at TIMESTAMPTZ,
  voided_by TEXT REFERENCES users(id),
  void_reason TEXT,
  idempotency_key TEXT,
  UNIQUE (exam_id, student_id, attempt_no)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_submission ON submissions (exam_id, student_id) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS submissions_exam_id_idx ON submissions (exam_id);
CREATE INDEX IF NOT EXISTS submissions_student_id_idx ON submissions (student_id);

-- 14. Cheating Events
CREATE TABLE IF NOT EXISTS cheating_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES users(id),
  student_name TEXT NOT NULL,
  student_roll_no TEXT,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  exam_title TEXT NOT NULL,
  violation_count INT NOT NULL DEFAULT 1,
  action_taken TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cheating_events_student_id_idx ON cheating_events (student_id);
CREATE INDEX IF NOT EXISTS cheating_events_exam_id_idx ON cheating_events (exam_id);
CREATE INDEX IF NOT EXISTS cheating_events_created_at_idx ON cheating_events (created_at);

-- 15. Login Audits
CREATE TABLE IF NOT EXISTS login_audits (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT REFERENCES users(id),
  user_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  identifier TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Success', 'Failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS login_audits_created_at_idx ON login_audits (created_at);
CREATE INDEX IF NOT EXISTS login_audits_user_id_idx ON login_audits (user_id);

-- 16. Deletion Audits
CREATE TABLE IF NOT EXISTS deletion_audits (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_user_id TEXT NOT NULL,
  deleted_user_name TEXT NOT NULL,
  deleted_user_email TEXT,
  deleted_role TEXT,
  role TEXT NOT NULL,
  identifier TEXT NOT NULL,
  deleted_by TEXT NOT NULL,
  deleted_by_admin_name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deletion_audits_created_at_idx ON deletion_audits (created_at);

-- 17. School Notices
CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'All',
  author_id TEXT REFERENCES users(id),
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notices_created_at_idx ON notices (created_at);

-- 18. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  target_role TEXT DEFAULT 'all',
  target_user_id TEXT REFERENCES users(id),
  link_tab TEXT,
  link_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_target_user_idx ON notifications (target_user_id);
CREATE INDEX IF NOT EXISTS notifications_target_role_idx ON notifications (target_role);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at);

-- 19. Notification Reads
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

-- 20. Study Materials
CREATE TABLE IF NOT EXISTS study_materials (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title TEXT NOT NULL,
  description TEXT,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  subject_name TEXT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  class_name TEXT,
  division_id TEXT NOT NULL REFERENCES divisions(id),
  division_name TEXT,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  teacher_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('file', 'link')),
  url TEXT NOT NULL,
  file_name TEXT,
  file_size TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_materials_class_div_sub_idx ON study_materials (class_id, division_id, subject_id);

-- 21. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id TEXT NOT NULL REFERENCES users(id),
  parent_name TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES users(id),
  student_name TEXT NOT NULL,
  student_class TEXT,
  recipient_id TEXT REFERENCES users(id),
  recipient_name TEXT,
  recipient_role TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_parent_id_idx ON support_tickets (parent_id);
CREATE INDEX IF NOT EXISTS support_tickets_student_id_idx ON support_tickets (student_id);
CREATE INDEX IF NOT EXISTS support_tickets_recipient_id_idx ON support_tickets (recipient_id);

-- 22. Ticket Replies
CREATE TABLE IF NOT EXISTS ticket_replies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_replies_ticket_id_idx ON ticket_replies (ticket_id, created_at);

-- 23. AI Conversation Threads
CREATE TABLE IF NOT EXISTS ai_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  role_id TEXT NOT NULL,
  subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_threads_user_id_idx ON ai_threads (user_id);

-- 24. AI Messages
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id TEXT NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  content TEXT NOT NULL,
  model_used TEXT,
  suggested_follow_ups JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_thread_id_idx ON ai_messages (thread_id, created_at);

-- 25. Uploads (bytea, max 1MB = 1048576 bytes)
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes <= 1048576),
  data BYTEA NOT NULL,
  uploaded_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 26. Settings (Key-Value configuration for academicConfig, schoolProfile, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS) on all tables (No policies defined: direct backend access only)
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheating_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
