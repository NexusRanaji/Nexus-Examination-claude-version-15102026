# Nexus Ranaji School Examination System (Production Deployment)

A high-concurrency, resilient, and tamper-resistant online examination system built with React, Vite, Express, TypeScript, and Supabase PostgreSQL.

---

## 1. System Credentials & Accounts

All legacy demo accounts, dummy tests, and public user directories have been wiped. The database is strictly initialized with the following four official accounts:

| Role | Username / User ID | Password | Scope & Permissions |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `Admin@Nexus2026` | Full school administration, academic structure, credential issuing, and audit monitoring |
| **Teacher** | `teacher.demo` | `Teacher@Nexus2026` | Question paper generation (Gemini AI assisted), exam scheduling, monitoring & grading |
| **Parent** | `parent.demo` | `Parent@Nexus2026` | Real-time student progress tracking, report cards & school notice access |
| **Student** | `student.demo` | `Student@Nexus2026` | Class 10A (Roll No: 1) candidate for secure locked-down examinations |

> **Security Notice**: Passwords are encrypted using salted bcrypt hashes. Backdoor passwords, demo preset quick-logins, and hardcoded evaluation bypasses are completely eliminated.

---

## 2. Environment Variables & Setup

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

### Required Configuration Keys

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | Supabase PostgreSQL direct connection or session pooler URL (AWS IPv4 pooler recommended) |
| `VITE_SUPABASE_URL` | Supabase Project API URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Public API Key |
| `JWT_SECRET` | Secret key used for signing and verifying JSON Web Tokens (min 32 characters) |
| `GEMINI_API_KEY` | Google Gemini API key for automated exam paper & question generation |
| `PORT` | Backend server port (default: `3000`) |

---

## 3. Database Schema & Migrations

Database migrations are located under `db/migrations/`:
- `001_init.sql`: Core relational tables (`users`, `classes`, `divisions`, `subjects`, `exams`, `submissions`, `exam_attempts`, `notices`, `cheating_audits`).
- `002_system_state.sql`: Resilient JSONB snapshot table (`nexus_system_state`) with Row Level Security (RLS) for zero-downtime state persistence.

### Running Migrations on a Fresh Supabase Project

To apply migrations against your configured Supabase database:

```bash
node --import tsx scripts/migrate.ts
```

To seed the clean initial accounts into Supabase:

```bash
node --import tsx scripts/import-legacy-json.ts --commit
```

To verify database users and bcrypt password authentication:

```bash
node --import tsx scripts/verify-accounts.ts
```

---

## 4. Production Hardening & Architectural Guarantees

### A. Database Settings Removed from UI
- Runtime cloud database configuration modals (`DatabaseSettingsModal`) and trigger buttons have been completely removed from the UI.
- All connections are exclusively driven through server-level environment variables (`DATABASE_URL`).
- The unauthenticated public user directory endpoint (`/api/auth/public-users`) returns empty data to prevent user enumeration.

### B. Exam Security & Fullscreen Lockout
- **Fullscreen Lock**: Examinations strictly require fullscreen mode. Exiting fullscreen, switching browser tabs, or blurring the browser window increments the malpractice counter.
- **Three-Strike Rule**: Students receive exactly 2 warnings. On the 3rd infraction, the exam is automatically terminated, flagged for academic malpractice, and submitted with audit logs.
- **Input Lockdown**: Right-click context menus, copy, paste, cut, text selection, F12 developer tools, PrintScreen, and keyboard shortcuts (`Ctrl+C`, `Ctrl+V`, `Ctrl+P`, `Ctrl+U`, `Ctrl+S`, `Ctrl+Shift+I/J/C`) are prevented.

### C. Concurrency & High Load Resilience (500+ Concurrent Students)
- In-flight submission mutex (`inFlightSubmissions`) prevents duplicate submissions and race conditions.
- Debounced disk and database state synchronization protects against I/O bottlenecks during concurrent timer autosaves.
- Submissions trigger synchronous immediate persistence (`saveStateToDisk(true)`).
- Supabase connection pool configured for high concurrency with connection timeouts.

### D. Offline & Wi-Fi Drop Resilience
- Answers are continuously persisted to dual browser storage (`localStorage` + `sessionStorage`).
- If network connection drops:
  - The student remains in the exam without losing progress.
  - An unobtrusive HUD banner informs the candidate: *"Offline – answers saved locally"*.
  - When connection is restored, answers automatically synchronize to the server.
- Submissions retain answers locally if an offline submission is attempted, allowing transparent retry.

### E. Bulk Credential Upload
- Class and division fields are strictly mandatory for **Student** accounts only.
- **Teacher** and **Parent** account creation allows optional or empty class/division values without validation failures.

