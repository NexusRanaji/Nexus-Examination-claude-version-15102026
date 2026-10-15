import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[Migrate] Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const allowDestructive = process.argv.includes('--allow-destructive');

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes('sslmode=require') || DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined
});

function isDestructive(sql: string): { destructive: boolean; reason?: string } {
  // Strip comments
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  if (/\bDROP\s+(TABLE|DATABASE|SCHEMA|TYPE)\b/i.test(cleanSql)) {
    return { destructive: true, reason: 'DROP TABLE/DATABASE/SCHEMA/TYPE statement detected' };
  }
  if (/\bTRUNCATE\b/i.test(cleanSql)) {
    return { destructive: true, reason: 'TRUNCATE statement detected' };
  }
  // Check for DELETE without WHERE
  const deleteMatches = cleanSql.match(/\bDELETE\s+FROM\s+[^\s;]+/gi);
  if (deleteMatches) {
    const statements = cleanSql.split(';');
    for (const stmt of statements) {
      if (/\bDELETE\s+FROM\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) {
        return { destructive: true, reason: 'DELETE FROM without WHERE clause detected' };
      }
    }
  }

  return { destructive: false };
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    // 1. Ensure schema_migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Fetch applied migrations
    const res = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC;');
    const appliedVersions = new Set(res.rows.map((r: { version: string }) => r.version));

    // 3. Find migration files
    const migrationsDir = path.resolve(__dirname, '../db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Migrate] No db/migrations directory found.');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('[Migrate] No migration SQL files found.');
      return;
    }

    let appliedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`[Migrate] Skipping already applied: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      const check = isDestructive(sqlContent);
      if (check.destructive && !allowDestructive) {
        console.error(`[Migrate] REFUSED: Migration ${file} contains destructive action: ${check.reason}.`);
        console.error('[Migrate] Run with --allow-destructive to confirm execution.');
        process.exit(1);
      }

      console.log(`[Migrate] Applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[Migrate] Successfully applied: ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[Migrate] Failed executing ${file}:`, err);
        throw err;
      }
    }

    console.log(`[Migrate] Migration complete. Applied ${appliedCount} new migration(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('[Migrate] Migration script failed:', err.message);
  process.exit(1);
});
