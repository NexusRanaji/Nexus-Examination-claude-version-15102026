/**
 * Comprehensive Request Validation and Data Sanitization for Nexus Ranaji Examination System
 */

export const ALLOWED_ROLES = ['superadmin', 'teacher', 'student', 'parent'] as const;
export type UserRole = typeof ALLOWED_ROLES[number];

export const ALLOWED_QUESTION_TYPES = ['single', 'multiple', 'true-false', 'fill-blank', 'numerical', 'subjective'] as const;
export type QuestionType = typeof ALLOWED_QUESTION_TYPES[number];

export function sanitizeString(val: any): string {
  if (typeof val !== 'string') return '';
  return val.trim();
}

export function isValidRole(role: any): role is UserRole {
  return typeof role === 'string' && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export function isValidPassword(pwd: any): boolean {
  return typeof pwd === 'string' && pwd.length >= 8;
}

export function isValidEmail(email: any): boolean {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validateUser(body: any, isUpdate = false): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!isUpdate || body.name !== undefined) {
    const name = sanitizeString(body.name);
    if (!name || name.length < 2) {
      errors.push('Name must be at least 2 characters long.');
    }
  }

  if (!isUpdate || body.role !== undefined) {
    if (!isValidRole(body.role)) {
      errors.push(`Role must be one of: ${ALLOWED_ROLES.join(', ')}.`);
    }
  }

  if (!isUpdate || body.username !== undefined) {
    const username = sanitizeString(body.username);
    if (!username || username.length < 3) {
      errors.push('Username must be at least 3 characters long.');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      errors.push('Username can only contain alphanumeric characters, dots, underscores, and dashes.');
    }
  }

  if ((!isUpdate && body.password) || (isUpdate && body.password !== undefined && body.password !== '')) {
    if (!isValidPassword(body.password)) {
      errors.push('Password must be at least 8 characters long.');
    }
  }

  if (body.email !== undefined && body.email !== '') {
    if (!isValidEmail(body.email)) {
      errors.push('Invalid email address format.');
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateQuestion(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const text = sanitizeString(body.text || body.question);
  if (!text) {
    errors.push('Question text is required.');
  }

  const type = body.type;
  if (!type || !(ALLOWED_QUESTION_TYPES as readonly string[]).includes(type)) {
    errors.push(`Question type must be one of: ${ALLOWED_QUESTION_TYPES.join(', ')}.`);
  }

  const points = Number(body.points);
  if (isNaN(points) || points <= 0) {
    errors.push('Points must be a positive number.');
  }

  if (type === 'single' || type === 'multiple') {
    if (!Array.isArray(body.options) || body.options.length < 2) {
      errors.push('Multiple choice questions require at least 2 options.');
    }
    if (body.correctAnswer === undefined || body.correctAnswer === null || body.correctAnswer === '') {
      errors.push('A correct answer must be specified.');
    }
  } else if (type === 'true-false') {
    if (body.correctAnswer === undefined || body.correctAnswer === null) {
      errors.push('Correct answer for True/False question must be provided.');
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateExam(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const title = sanitizeString(body.title);
  if (!title || title.length < 3) {
    errors.push('Exam title must be at least 3 characters.');
  }

  const subject = sanitizeString(body.subject);
  if (!subject) {
    errors.push('Exam subject is required.');
  }

  const durationMinutes = Number(body.durationMinutes);
  if (isNaN(durationMinutes) || durationMinutes <= 0) {
    errors.push('Exam duration must be greater than 0 minutes.');
  }

  const totalMarks = Number(body.totalMarks);
  if (isNaN(totalMarks) || totalMarks <= 0) {
    errors.push('Total marks must be greater than 0.');
  }

  if (body.questions !== undefined && !Array.isArray(body.questions)) {
    errors.push('Questions must be an array.');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateTicket(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const subject = sanitizeString(body.subject);
  if (!subject || subject.length < 3) {
    errors.push('Ticket subject must be at least 3 characters.');
  }

  const message = sanitizeString(body.message);
  if (!message || message.length < 5) {
    errors.push('Ticket message must be at least 5 characters.');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateNotice(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const title = sanitizeString(body.title);
  if (!title || title.length < 3) {
    errors.push('Notice title must be at least 3 characters.');
  }

  const content = sanitizeString(body.content);
  if (!content || content.length < 5) {
    errors.push('Notice content must be at least 5 characters.');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateSubmission(body: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!body.examId) {
    errors.push('Exam ID is required.');
  }

  if (body.answers !== undefined && typeof body.answers !== 'object') {
    errors.push('Answers must be an object map or array.');
  }

  return { isValid: errors.length === 0, errors };
}
