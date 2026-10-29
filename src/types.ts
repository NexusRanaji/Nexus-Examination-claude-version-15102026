export type UserRole = 'superadmin' | 'teacher' | 'student' | 'parent';

export interface UserCredential {
  id: string;
  name: string;
  username?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  rollNo?: string;
  employeeId?: string;
  classId?: string;
  divisionId?: string;
  parentId?: string;
  childrenIds?: string[];
  assignedSubjects?: string[];
  createdAt?: string;
  bonusPoints?: number;
  password?: string;
  rawPassword?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;
  isSuperAdmin?: boolean;
  status?: string;
  academicPoints?: number;
  updatedAt?: string;
  [key: string]: any;
}

export type User = UserCredential;

export interface SchoolClass {
  id: string;
  name: string;
  grade?: number;
  level?: string | number;
  createdAt?: string;
  [key: string]: any;
}

export interface Division {
  id: string;
  classId: string;
  name: string;
  roomNumber?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  classId?: string;
  icon?: string;
  [key: string]: any;
}

export type QuestionType =
  | 'single'
  | 'multiple'
  | 'multi'
  | 'true-false'
  | 'true_false'
  | 'fill-blank'
  | 'fill_blank'
  | 'numerical'
  | 'subjective'
  | string;

export interface Question {
  id: string;
  text: string;
  title?: string;
  question?: string;
  type: QuestionType;
  options?: any;
  correctAnswer: any;
  explanation?: string;
  points: number;
  imageUrl?: string;
  subjectId?: string;
  classId?: string;
  chapterName?: string;
  inQuestionBank?: boolean;
  createdAt?: string;
  [key: string]: any;
}

export interface Exam {
  id: string;
  title: string;
  description?: string;
  subjectId: string;
  subjectName?: string;
  classId: string;
  className?: string;
  divisionId?: string;
  divisionName?: string;
  teacherId: string;
  teacherName?: string;
  status: 'draft' | 'published' | 'completed' | 'archived' | string;
  startTime?: string;
  endTime?: string;
  durationMinutes: number;
  passingScore: number;
  totalMarks: number;
  questionCount?: number;
  questions?: any[];
  createdAt?: string;
  [key: string]: any;
}

export interface ExamSubmission {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  studentRollNo: string;
  classId?: string;
  divisionId?: string;
  score: number;
  totalMarks: number;
  percentage: number;
  status: 'pass' | 'fail' | 'submitted' | 'evaluated' | string;
  answers?: Record<string, any>;
  timeSpentSeconds?: number;
  submittedAt: string;
  cheatingLog?: any[];
  cheatingFlagged?: boolean;
  cheatingDetails?: string | any;
  bonusPointsAwarded?: number;
  subjectName?: string;
  passed?: boolean;
  [key: string]: any;
}

export interface StudyMaterial {
  id: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  classId?: string;
  className?: string;
  type?: 'pdf' | 'notes' | 'video' | 'link' | string;
  fileUrl?: string;
  url?: string;
  description?: string;
  createdAt?: string;
  [key: string]: any;
}

export interface SupportTicket {
  id: string;
  senderId: string;
  senderName?: string;
  studentId?: string;
  studentName?: string;
  studentClass?: string;
  parentName?: string;
  recipientId?: string;
  recipientName?: string;
  subject: string;
  category?: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | string;
  status: 'Open' | 'In Progress' | 'Resolved' | string;
  replies?: any[];
  createdAt: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface SchoolNotice {
  id: string;
  title: string;
  content: string;
  priority?: 'low' | 'medium' | 'high' | string;
  targetAudience?: 'all' | 'teacher' | 'student' | 'parent' | string;
  createdAt?: string;
  authorName?: string;
  [key: string]: any;
}

export interface NotificationItem {
  id: string;
  userId?: string;
  title: string;
  message: string;
  type?: string;
  read?: boolean;
  createdAt?: string;
  targetAudience?: string;
  [key: string]: any;
}

export type NotificationCategory = 'all' | 'academic' | 'system' | 'alerts' | string;

export interface LoginAuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  role?: string;
  identifier?: string;
  ipAddress?: string;
  userAgent?: string;
  status: string;
  failureReason?: string;
  [key: string]: any;
}

export interface CheatingAuditLog {
  id: string;
  timestamp: string;
  studentId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  reason: string;
  details?: string;
  [key: string]: any;
}

export interface DeletedCredentialLog {
  id: string;
  timestamp: string;
  deletedUserId: string;
  deletedUserName: string;
  deletedUserRole: string;
  deletedByAdminId: string;
  deletedByAdminName: string;
  [key: string]: any;
}

export interface SchoolStats {
  totalStudents: number;
  totalTeachers: number;
  totalParents: number;
  totalExams: number;
  activeExams: number;
  totalSubmissions: number;
  [key: string]: any;
}

export interface AcademicConfig {
  minimumPassPercentage: number;
  bonusPointsPerExam: number;
  standingsTiers?: any[];
  [key: string]: any;
}

export interface AcademicStandingTier {
  id: string;
  name: string;
  minPercentage: number;
  badge: string;
  color: string;
  [key: string]: any;
}

export interface TestBadgeRule {
  id: string;
  badgeName: string;
  minScore: number;
  icon?: string;
  [key: string]: any;
}

export interface OverallBadgeRule {
  id: string;
  badgeName: string;
  minPercentage: number;
  minExamsCompleted: number;
  icon?: string;
  [key: string]: any;
}

export interface AIConversationThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: {
    id: string;
    sender: 'user' | 'assistant';
    content: string;
    timestamp: string;
    [key: string]: any;
  }[];
  [key: string]: any;
}
