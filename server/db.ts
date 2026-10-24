import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

// Read .env if present in root
function loadEnvFile() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }

    // Secondary fallback: check data/supabase_config.json if .env is missing or deleted
    const configPath = path.resolve(process.cwd(), 'data/supabase_config.json');
    if (!process.env.DATABASE_URL && fs.existsSync(configPath)) {
      try {
        const conf = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (conf.databaseUrl) {
          process.env.DATABASE_URL = conf.databaseUrl;
          console.log('[DB] Loaded database URL from data/supabase_config.json');
        }
      } catch {}
    }
  } catch (err: any) {
    console.warn('[DB] Could not load .env file:', err.message);
  }
}
loadEnvFile();

declare global {
  var _nexusPgPool: pg.Pool | undefined;
}

let connectionString = process.env.DATABASE_URL || '';

/**
 * Robust sanitizer and validator for Supabase & PostgreSQL connection strings
 */
export function sanitizeAndValidateDatabaseUrl(raw: string): { cleanUrl: string; error?: string } {
  let str = (raw || '').trim();

  // Strip wrapping quotes
  str = str.replace(/^["'`]|["'`]$/g, '').trim();

  // Strip `psql ` command prefix if copied from CLI instructions
  if (str.startsWith('psql ')) {
    str = str.replace(/^psql\s+/, '').trim().replace(/^["'`]|["'`]$/g, '').trim();
  }

  if (!str) {
    return { cleanUrl: '', error: 'Database URL cannot be empty.' };
  }

  // Detect if user pasted Supabase HTTP REST API URL instead of PostgreSQL URI
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return {
      cleanUrl: '',
      error: 'You pasted a Supabase REST API URL (https://...). To connect PostgreSQL, use the Connection String URI starting with "postgresql://". In Supabase, click "Connect" at top or go to Project Settings -> Database -> Connection string -> URI.'
    };
  }

  // Detect unreplaced password placeholders (literal YOUR-PASSWORD)
  if (/\[YOUR-PASSWORD\]|\[YOUR_PASSWORD\]|<YOUR-PASSWORD>|<password>|\[password\]/i.test(str)) {
    return {
      cleanUrl: '',
      error: 'The connection string still contains the placeholder "[YOUR-PASSWORD]". Please replace "[YOUR-PASSWORD]" with your actual Supabase database password.'
    };
  }

  // Auto-strip accidental square brackets around the password, e.g. :[nexusranaji1984]@ -> :nexusranaji1984@
  str = str.replace(/:\[([^\]\s]+)\]@/, ':$1@');

  // Normalize postgres:// to postgresql://
  if (str.startsWith('postgres://')) {
    str = 'postgresql://' + str.substring(11);
  }

  if (!str.startsWith('postgresql://')) {
    return {
      cleanUrl: '',
      error: 'Invalid connection protocol. PostgreSQL connection strings must begin with "postgresql://".'
    };
  }

  // Check for password with unencoded special characters like '@' or '#' between : and @host
  try {
    // Test basic URI structure
    const protoIndex = str.indexOf('://');
    const afterProto = str.substring(protoIndex + 3);
    const lastAt = afterProto.lastIndexOf('@');
    if (lastAt !== -1) {
      const userInfo = afterProto.substring(0, lastAt);
      const hostAndRest = afterProto.substring(lastAt + 1);
      const colonIndex = userInfo.indexOf(':');
      if (colonIndex !== -1) {
        const user = userInfo.substring(0, colonIndex);
        let password = userInfo.substring(colonIndex + 1);
        
        // If password has raw characters that could break parsing if decoded
        // (like unencoded '@'), encode safely:
        if (password.includes('@') || password.includes('#') || password.includes('?') || password.includes('&')) {
          const encodedPassword = encodeURIComponent(decodeURIComponent(password));
          str = `postgresql://${user}:${encodedPassword}@${hostAndRest}`;
        }
      }
    }
  } catch {
    // Keep as is if custom parsing fails
  }

  return { cleanUrl: str };
}

function createPool(connStr: string): pg.Pool {
  const isLocal = !connStr || connStr.includes('localhost') || connStr.includes('127.0.0.1');

  return new Pool({
    connectionString: connStr || undefined,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 12000,
    // Enable SSL for any cloud/remote database (Supabase, Neon, Render, etc.)
    ssl: isLocal ? undefined : { rejectUnauthorized: false }
  });
}

export let pool = global._nexusPgPool || createPool(connectionString);

if (process.env.NODE_ENV !== 'production') {
  global._nexusPgPool = pool;
}

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle PostgreSQL client:', err.message);
});

export function isDatabaseConfigured(): boolean {
  return Boolean(connectionString && connectionString.trim().length > 0);
}

export function getDatabaseHost(): string | null {
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    return parsed.host;
  } catch {
    // Regex fallback
    const match = connectionString.match(/@([^:/]+)/);
    return match ? match[1] : 'External PostgreSQL';
  }
}

export async function query<R extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<R>> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  return pool.query<R>(text, params);
}

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[DB] Failed to rollback transaction:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  if (!connectionString) {
    return true; // Local JSON mode is active
  }
  try {
    const res = await pool.query('SELECT 1 as alive');
    return (res.rows?.[0] as any)?.alive === 1;
  } catch (err: any) {
    console.warn('[DB] Healthcheck failed:', err.message);
    return false;
  }
}

// Ensure the core system state table exists in Supabase/PostgreSQL
export async function ensureStateTable(): Promise<boolean> {
  if (!connectionString) return false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.nexus_system_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.nexus_system_state ENABLE ROW LEVEL SECURITY;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies 
          WHERE tablename = 'nexus_system_state' AND policyname = 'Allow service role and postgres access'
        ) THEN
          CREATE POLICY "Allow service role and postgres access" 
          ON public.nexus_system_state 
          FOR ALL 
          TO postgres, service_role 
          USING (true) 
          WITH CHECK (true);
        END IF;
      END
      $$;
    `);
    console.log('[DB] Verified nexus_system_state table & RLS policies in Supabase PostgreSQL.');
    return true;
  } catch (err: any) {
    console.error('[DB] Failed to ensure nexus_system_state table:', err.message);
    return false;
  }
}

let _dbSyncDisabledDueToAuth = false;

// Load persisted state snapshot from Supabase PostgreSQL
export async function loadStateFromPostgres(): Promise<any | null> {
  if (!connectionString || _dbSyncDisabledDueToAuth) return null;
  try {
    const tableReady = await ensureStateTable();
    if (!tableReady) return null;
    const res = await pool.query(`
      SELECT payload, updated_at 
      FROM nexus_system_state 
      WHERE id = 'active_state' 
      LIMIT 1;
    `);
    if (res.rows && res.rows.length > 0 && res.rows[0].payload) {
      console.log(`[DB] Loaded persistent state from Supabase PostgreSQL (saved at: ${res.rows[0].updated_at})`);
      return res.rows[0].payload;
    }
    return null;
  } catch (err: any) {
    if (err.message && (err.message.includes('authentication failed') || err.message.includes('password authentication'))) {
      _dbSyncDisabledDueToAuth = true;
      console.warn('[DB] Supabase authentication failed. Pausing remote sync and using local storage.');
    } else {
      console.warn('[DB] Could not load state from Supabase PostgreSQL:', err.message);
    }
    return null;
  }
}

// Save persisted state snapshot to Supabase PostgreSQL
export async function saveStateToPostgres(payload: any): Promise<boolean> {
  if (!connectionString || _dbSyncDisabledDueToAuth) return false;
  try {
    await pool.query(`
      INSERT INTO nexus_system_state (id, payload, updated_at)
      VALUES ('active_state', $1, now())
      ON CONFLICT (id) DO UPDATE 
      SET payload = EXCLUDED.payload, updated_at = now();
    `, [payload]);
    return true;
  } catch (err: any) {
    if (err.message && (err.message.includes('authentication failed') || err.message.includes('password authentication'))) {
      _dbSyncDisabledDueToAuth = true;
      console.warn('[DB] Supabase authentication failed. Paused remote database sync. Active state preserved in local JSON storage.');
    } else {
      console.warn('[DB] Notice: Could not sync state to Supabase PostgreSQL:', err.message);
    }
    return false;
  }
}

// Dynamically set new Database Connection String (e.g. Supabase URL entered by user)
export async function setDatabaseUrl(newConnStr: string): Promise<{ success: boolean; message: string; host?: string }> {
  const { cleanUrl, error } = sanitizeAndValidateDatabaseUrl(newConnStr);
  if (error || !cleanUrl) {
    throw new Error(error || 'Invalid database connection string.');
  }

  // Test new pool connection
  const testPool = createPool(cleanUrl);
  try {
    const res = await testPool.query('SELECT 1 as test, current_database() as db_name, version() as version');
    const dbName = res.rows?.[0]?.db_name || 'postgres';

    // Ensure state table exists with RLS enabled
    await testPool.query(`
      CREATE TABLE IF NOT EXISTS public.nexus_system_state (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.nexus_system_state ENABLE ROW LEVEL SECURITY;
    `);

    // Close old pool safely
    try {
      await pool.end();
    } catch {
      // ignore
    }

    // Switch active pool
    connectionString = cleanUrl;
    process.env.DATABASE_URL = cleanUrl;
    _dbSyncDisabledDueToAuth = false;
    pool = testPool;
    if (process.env.NODE_ENV !== 'production') {
      global._nexusPgPool = pool;
    }

    // Persist to .env file so it survives container restarts
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }

      if (envContent.includes('DATABASE_URL=')) {
        envContent = envContent.replace(/DATABASE_URL=.*(\r?\n|$)/, `DATABASE_URL="${cleanUrl}"$1`);
      } else {
        envContent += `\nDATABASE_URL="${cleanUrl}"\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('[DB] Saved new DATABASE_URL to .env file.');
    } catch (saveErr: any) {
      console.warn('[DB] Could not write DATABASE_URL to .env:', saveErr.message);
    }

    const host = getDatabaseHost() || 'Supabase';
    return {
      success: true,
      message: `Successfully connected to database "${dbName}" at ${host}!`,
      host
    };
  } catch (err: any) {
    // If direct Supabase connection fails due to IPv6 routing or timeout, try Supabase session pooler
    if (err.message.includes('timeout') || err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      const match = cleanUrl.match(/postgresql:\/\/postgres:([^@]+)@db\.([a-z0-9_-]+)\.supabase\.co:5432\/postgres/i);
      if (match) {
        const pass = match[1];
        const ref = match[2];
        const regionsToTry = ['aws-0-ap-southeast-1', 'aws-0-ap-south-1', 'aws-0-us-east-1', 'aws-0-eu-central-1'];
        for (const reg of regionsToTry) {
          const poolerUrl = `postgresql://postgres.${ref}:${pass}@${reg}.pooler.supabase.com:6543/postgres`;
          const poolerTest = createPool(poolerUrl);
          try {
            const res2 = await poolerTest.query('SELECT 1 as test, current_database() as db_name, version() as version');
            const dbName = res2.rows?.[0]?.db_name || 'postgres';
            await poolerTest.query(`
              CREATE TABLE IF NOT EXISTS public.nexus_system_state (
                id TEXT PRIMARY KEY,
                payload JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
              );
              ALTER TABLE public.nexus_system_state ENABLE ROW LEVEL SECURITY;
            `);
            try { await pool.end(); } catch {}
            connectionString = poolerUrl;
            process.env.DATABASE_URL = poolerUrl;
            pool = poolerTest;
            if (process.env.NODE_ENV !== 'production') {
              global._nexusPgPool = pool;
            }
            try {
              const envPath = path.resolve(process.cwd(), '.env');
              let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
              if (envContent.includes('DATABASE_URL=')) {
                envContent = envContent.replace(/DATABASE_URL=.*(\r?\n|$)/, `DATABASE_URL="${poolerUrl}"$1`);
              } else {
                envContent += `\nDATABASE_URL="${poolerUrl}"\n`;
              }
              fs.writeFileSync(envPath, envContent, 'utf8');
            } catch {}
            return {
              success: true,
              message: `Successfully connected to Supabase database "${dbName}" via IPv4 Pooler (${reg})!`,
              host: `${reg}.pooler.supabase.com`
            };
          } catch {
            try { await poolerTest.end(); } catch {}
          }
        }
      }
    }

    let userFriendlyMsg = err.message;
    if (err.message.includes('password authentication failed')) {
      userFriendlyMsg = 'Authentication failed: The database password in your connection string is incorrect. If you forgot your password, open your Supabase project -> Project Settings -> Database -> scroll down to "Database password" and click "Reset database password".';
    } else if (err.message.includes('getaddrinfo ENOTFOUND') || err.message.includes('ENOTFOUND')) {
      userFriendlyMsg = 'Host not found: Could not reach the database server. Check that your Supabase project URL/host is spelled correctly.';
    } else if (err.message.includes('ETIMEDOUT') || err.message.includes('timeout')) {
      userFriendlyMsg = 'Connection timed out: Could not connect to Supabase. Note: If your network uses IPv4, make sure you copy the "Session pooler" connection string (port 6543) from Supabase rather than direct connection (port 5432).';
    }

    throw new Error(`Database connection failed: ${userFriendlyMsg}`);
  }
}

// Run SQL migrations (001_init.sql etc.)
export async function runAllMigrations(): Promise<{ success: boolean; appliedCount: number; logs: string[] }> {
  if (!connectionString) {
    throw new Error('Cannot run migrations: DATABASE_URL is not configured');
  }

  const logs: string[] = [];
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const res = await client.query('SELECT version FROM schema_migrations ORDER BY version ASC;');
    const appliedVersions = new Set(res.rows.map((r: { version: string }) => r.version));

    const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      return { success: true, appliedCount: 0, logs: ['No db/migrations directory found.'] };
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedVersions.has(file)) {
        logs.push(`Skipping already applied migration: ${file}`);
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf8');

      logs.push(`Applying migration: ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logs.push(`Successfully applied: ${file}`);
        count++;
      } catch (err: any) {
        await client.query('ROLLBACK');
        logs.push(`Failed executing ${file}: ${err.message}`);
        throw err;
      }
    }

    return { success: true, appliedCount: count, logs };
  } finally {
    client.release();
  }
}
