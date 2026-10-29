# Deployment & GitHub Integration Guide: Nexus Ranaji English School Examination System

This document outlines the deployment requirements, runtime environment configurations, and instructions for integrating this tested export into an existing GitHub repository while preserving Git commit history.

---

## 1. Runtime & Hosting Requirements

### Environment Prerequisites
- **Node.js**: Version `20.x` LTS or `22.x` LTS (minimum version `18.18.0` due to Node native test runner and `--import` flag support).
- **Package Manager**: `npm` (v10+), `yarn` (v1.22+), or `pnpm` (v9+).
- **Operating System**: Linux (Ubuntu 22.04+ / Debian 12 recommended for production), macOS, or Windows (Windows Server / Windows 10/11 fully supported).
- **Memory**: Minimum 512 MB RAM (1 GB recommended for production workloads and asset bundling).
- **Persistent Disk Storage**:
  - The default database storage resides in `data/` (JSON-backed).
  - Uploaded materials and exam attachments reside in `uploads/`.
  - For containerized hosting (e.g., Docker, AWS ECS, Google Cloud Run, Railway, Render), mount persistent volumes to `/app/data` and `/app/uploads`, or configure the PostgreSQL/Supabase integration via `DATABASE_URL`.

---

## 2. Environment Variables Configuration

Create a `.env` file in the root directory based on `.env.example`. **Never commit `.env` or plain secret keys to version control.**

| Variable Name | Required | Description | Example / Recommended Format |
|---|:---:|---|---|
| `PORT` | Optional | Port on which the server listens. | `3000` (Defaults to `3000` or hosting provider `$PORT`) |
| `NODE_ENV` | Recommended | Deployment environment mode. | `production` or `development` |
| `JWT_SECRET` | **Required in Prod** | Secret key used to sign and verify JSON Web Tokens. Must be at least 32 characters long. In production, missing or short secrets will halt startup. | Generate via `openssl rand -hex 32` |
| `GEMINI_API_KEY` | Optional | Google Gemini API key enabling GyanMitra AI tutor, question generation, and parent counseling features. | API key from Google AI Studio |
| `APP_URL` | Optional | Public fully-qualified domain URL for CORS and callback bindings. | `https://exams.nexusranaji.edu` |
| `DATABASE_URL` | Optional | Direct PostgreSQL connection string for Supabase or external SQL storage. If omitted, uses local `data/nexus_school_db.json`. | `postgresql://user:pass@host:5432/dbname` |
| `VITE_SUPABASE_URL` | Optional | Public Supabase project URL for client real-time synchronization. | `https://[project-id].supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Optional | Public Supabase anonymous client key. | Public anon JWT string |

---

## 3. Installation, Build, and Run Commands

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Run Quality & Security Audits
```bash
# Run the complete test suite (56 automated tests across 9 suites)
npm test

# Run TypeScript type safety and linting verification
npm run lint

# Audit the user roster for weak default passwords (optional)
npx tsx scripts/audit-default-passwords.ts
```

### Step 3: Production Build
```bash
npm run build
```
This performs:
1. `vite build`: Compiles optimized frontend React assets into `dist/`.
2. `esbuild server.ts`: Bundles the Express backend into an optimized standalone `server.js` file.

### Step 4: Start the Production Server
```bash
# Option A: Start using the pre-bundled server
node server.js

# Option B: Start via npm script
npm start
```

### Step 5: Health Verification
Once started, verify that the healthcheck endpoint responds:
```bash
curl http://localhost:3000/healthz
# Expected output: {"status":"ok"}
```

---

## 4. How to Apply These Changes to Your Existing GitHub Repository

To integrate these changes into your existing GitHub repository without losing commit history or overwriting uncommitted work, follow this procedure:

### Option A: Using a Dedicated Git Branch (Recommended)

1. **Clone or open your existing GitHub repository locally**:
   ```bash
   cd /path/to/your-existing-github-repo
   git fetch origin
   git status
   ```

2. **Create and switch to a new integration branch**:
   ```bash
   git checkout -b feature/qa-hardened-checkpoint
   ```

3. **Extract the exported ZIP archive into a temporary folder**:
   ```bash
   unzip nexus-ranaji-exam-system-verified.zip -d /tmp/nexus-export
   ```

4. **Copy the verified files into your repository working tree**:
   ```bash
   # Copy source, server, tests, and configuration files
   cp -r /tmp/nexus-export/src .
   cp -r /tmp/nexus-export/server .
   cp -r /tmp/nexus-export/scripts .
   cp -r /tmp/nexus-export/tests .
   cp -r /tmp/nexus-export/public .
   cp /tmp/nexus-export/package.json .
   cp /tmp/nexus-export/tsconfig.json .
   cp /tmp/nexus-export/vite.config.ts .
   cp /tmp/nexus-export/index.html .
   cp /tmp/nexus-export/metadata.json .
   cp /tmp/nexus-export/.env.example .
   cp /tmp/nexus-export/CHANGELOG.md .
   cp /tmp/nexus-export/DEPLOYMENT.md .
   cp /tmp/nexus-export/data/nexus_school_db.example.json ./data/
   ```

5. **Review the exact diff**:
   ```bash
   git status
   git diff
   ```
   *Note: Verify that your real `data/nexus_school_db.json` is protected and NOT staged.*

6. **Run tests locally on your branch**:
   ```bash
   npm install
   npm test
   npm run lint
   npm run build
   ```

7. **Commit the changes with a clear commit message**:
   ```bash
   git add src/ server/ scripts/ tests/ public/ package.json tsconfig.json vite.config.ts index.html metadata.json .env.example CHANGELOG.md DEPLOYMENT.md data/nexus_school_db.example.json
   git commit -m "feat(security): apply 15 verified QA fixes, cross-platform test harness, and server hardening"
   ```

8. **Push the branch and create a Pull Request for review**:
   ```bash
   # (Execute only after your review and approval)
   git push -u origin feature/qa-hardened-checkpoint
   ```

### Option B: Reviewing the 15 Specific Files via Git Patch

If you prefer to inspect and apply changes file by file:
- The 15 edited files are:
  1. `scripts/audit-default-passwords.ts`
  2. `scripts/reset-password.ts`
  3. `server/validation.ts`
  4. `tests/helpers/harness.ts`
  5. `tests/auth.test.ts`
  6. `tests/credentials.test.ts`
  7. `tests/faculty.test.ts`
  8. `tests/hardening.test.ts`
  9. `tests/ai-routes.test.ts`
  10. `tests/notices-reset.test.ts`
  11. `tests/notifications-tickets.test.ts`
  12. `tests/storage.test.ts`
  13. `tests/tickets.test.ts`
  14. `package.json`
  15. `server.ts`
- You can copy just these 15 files into your working tree and run `git diff` to inspect every addition before committing.

---

## 5. Security & Data Protection Checklist
- [x] Real school database records (`nexus_school_db.json`) excluded from distribution.
- [x] Database backups (`*.bak`) excluded from distribution.
- [x] Environment files containing private keys (`.env`, `.env.local`) excluded.
- [x] Evaluator backdoor removed (FP-AUTH-S4 resolved).
- [x] `JWT_SECRET` production enforcement active (minimum 32 characters).
- [x] Test harness sandboxed using ephemeral `os.tmpdir()` databases.
- [x] Healthcheck error messages sanitized against data leakage.
