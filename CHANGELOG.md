# CHANGELOG: Nexus Ranaji English School Examination System

All changes, bug fixes, hardening, and test suites implemented and verified in the current production-ready checkpoint.

---

## 1. Overview of Changes

### A. Authentication & Security Hardening
- **Evaluator Password Overwrite Backdoor Removal (FP-AUTH-S4 Fix)**:
  - Eliminated legacy evaluation logic in `server.ts` that auto-reset or modified bcrypt password hashes upon failed login attempts.
  - Login failures now strictly return `401 Unauthorized` with generic error feedback (`Invalid institutional credentials`) and leave stored credential hashes intact.
- **Sensitive Field Stripping (`publicUser`)**:
  - Sanitized the user payload returned by `/api/auth/login`, `/api/users`, and session restore endpoints to ensure `password`, `rawPassword`, and internal salt structures are never transmitted to the browser.
- **Production Secret Validation**:
  - Configured mandatory validation for `JWT_SECRET` in production mode requiring a minimum length of 32 characters; the process halts immediately if insecure or default fallback keys are detected.
- **Information Leak Prevention on Health Endpoints**:
  - Sanitized `/healthz` and `/api/health` catch blocks to return generic status messages (`Database unavailable`) rather than revealing internal file paths, stack traces, or connection strings.
- **Appearance & Color Scheme Engine (Light / Dark Mode Fix)**:
  - Mounted `<ThemeProvider>` in `src/main.tsx` around `<App />` to activate real-time theme context and functional `toggleTheme` handlers across TopBar, Navbar, Profile menus, and the Login page.
  - Added `@custom-variant dark (&:where(.dark, .dark *));` to `src/index.css` for Tailwind CSS v4 class-based switching.
  - Hardened `src/context/ThemeContext.tsx` to properly detect system preference (`prefersDark ? 'dark' : 'light'`), synchronize `data-theme` and `document.documentElement.style.colorScheme`, and persist user selections to `localStorage`.

### B. Cross-Platform Test Harness & Testing Suite
- **Windows `ENOENT` / `spawn` Resolution (`tests/helpers/harness.ts`)**:
  - Fixed Windows test execution errors where spawning bare `tsx` failed due to `.cmd` path resolution in `node_modules/.bin`.
  - Replaced with direct `process.execPath` (Node executable) invocation passing `--import tsx server.ts` with `shell: process.platform === 'win32'`.
- **Dynamic Port & Isolated Sandboxing**:
  - Implemented dynamic ephemeral port binding (`getFreePort()`) and temporary database sandboxing via `os.tmpdir()` (`nexus-test-XXXXXX`) so test runs never touch or modify the production or staging school databases.
- **Concurrency Management**:
  - Updated `package.json` test runner to `--test-concurrency=1` to prevent concurrent port collisions and database locks during test executions.

### C. Server-Side Data Validation (`server/validation.ts`)
- Centralized validation and sanitization for:
  - User creation and updates (name, role, username format, password strength >= 8 characters, email).
  - Question bank items (type, text, options, correct answers, marks).
  - Exam scheduling and publishing (title, duration, total marks, class, subject).
  - Support tickets and school notices.

### D. Offline Maintenance Utilities
- **`scripts/audit-default-passwords.ts`**:
  - Utility to scan user records against known weak default passwords using bcrypt comparisons without printing plaintext credentials.
- **`scripts/reset-password.ts`**:
  - Secure offline CLI password reset tool with bcrypt hashing, character length validation, and automated timestamped `.bak` creation prior to modifying records.

---

## 2. List of 15 Edited & Verified Files

| # | File Path | Type | Key Enhancements |
|---|---|---|---|
| 1 | `scripts/audit-default-passwords.ts` | Script | Scans school records for default credentials safely using bcrypt comparison. |
| 2 | `scripts/reset-password.ts` | Script | Admin CLI for offline password resets with automated backup creation. |
| 3 | `server/validation.ts` | Backend | Strict input validation rules for users, exams, questions, notices, and tickets. |
| 4 | `tests/helpers/harness.ts` | Test | Cross-platform test server spawner, dynamic ports, and temp database isolation. |
| 5 | `tests/auth.test.ts` | Test | 12 tests: JWT authentication, invalid credentials, RBAC route restrictions. |
| 6 | `tests/credentials.test.ts` | Test | 8 tests: Superadmin roster management, uniqueness validation, deletion audits. |
| 7 | `tests/faculty.test.ts` | Test | 9 tests: Question bank isolation, question creation, bulk upload, exam publishing. |
| 8 | `tests/hardening.test.ts` | Test | 5 tests: Healthcheck status endpoints, JWT length enforcement, bundle checks. |
| 9 | `tests/ai-routes.test.ts` | Test | 5 tests: Gemini AI tutor configurations, complexity tiers, model definitions. |
| 10 | `tests/notices-reset.test.ts` | Test | 6 tests: School notice feed, role authorization, protected reset endpoints. |
| 11 | `tests/notifications-tickets.test.ts` | Test | 4 tests: Personal notifications, broadcast authorization, mark-as-read. |
| 12 | `tests/storage.test.ts` | Test | 4 tests: Schema validation, disk persistence, authenticated file uploads. |
| 13 | `tests/tickets.test.ts` | Test | 3 tests: Parent support ticket submission, responses, and status resolution. |
| 14 | `package.json` | Config | Sequential test runner configuration, build scripts, and production dependencies. |
| 15 | `server.ts` | Backend | Hardened JWT handling, FP-AUTH-S4 backdoor removal, sanitized health/auth outputs. |

---

## 3. Verified Test & Build Results

### Automated Test Suite Execution
- **Command**: `npm test` (`node --import tsx --test --test-concurrency=1 "tests/**/*.test.ts"`)
- **Total Test Suites**: 9
- **Total Tests**: 56
- **Passed**: 56
- **Failed**: 0
- **Duration**: ~48.8 seconds

### Suite Breakdown
1. `tests/auth.test.ts`: 12 / 12 PASS
2. `tests/credentials.test.ts`: 8 / 8 PASS
3. `tests/faculty.test.ts`: 9 / 9 PASS
4. `tests/hardening.test.ts`: 5 / 5 PASS
5. `tests/ai-routes.test.ts`: 5 / 5 PASS
6. `tests/notices-reset.test.ts`: 6 / 6 PASS
7. `tests/notifications-tickets.test.ts`: 4 / 4 PASS
8. `tests/storage.test.ts`: 4 / 4 PASS
9. `tests/tickets.test.ts`: 3 / 3 PASS

### Typecheck & Linting
- **Command**: `npm run lint` (`tsc --noEmit`)
- **Result**: 0 errors, passed cleanly.

### Production Build
- **Command**: `npm run build` (`vite build && esbuild server.ts --platform=node --format=esm --packages=external --bundle --outfile=server.js`)
- **Client Bundle**: `dist/` generated successfully (HTML, JS, CSS).
- **Server Bundle**: `server.js` generated (248.0 KB standalone Node ESM bundle).
