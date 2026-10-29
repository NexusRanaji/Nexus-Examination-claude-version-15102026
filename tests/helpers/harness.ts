import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

export interface TestServer {
  port: number;
  baseUrl: string;
  jwtSecret: string;
  dbPath: string;
  stop: () => Promise<void>;
  request: (endpoint: string, options?: RequestInit) => Promise<{
    status: number;
    headers: Headers;
    body: any;
    text: string;
  }>;
  login: (identifier: string, password: string) => Promise<{ token: string; user: any }>;
  authHeaders: (token: string) => Record<string, string>;
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

export async function startTestServer(customEnv: Record<string, string> = {}): Promise<TestServer> {
  const port = await getFreePort();
  const projectRoot = process.cwd();
  const originalDb = path.join(projectRoot, 'data/nexus_school_db.json');

  // Create isolated temp DB file
  const tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  const tempDbPath = path.join(tempDbDir, 'nexus_test_db.json');
  if (fs.existsSync(originalDb)) {
    fs.copyFileSync(originalDb, tempDbPath);
  }

  const jwtSecret = customEnv.JWT_SECRET || 'nexus_super_test_jwt_secret_32_characters_minimum_len!';

  // Cross-platform spawn without ENOENT or space path truncation on Windows:
  // Using process.execPath with --import tsx directly launches Node with tsx loader via CreateProcessW (shell: false)
  let startupError = '';
  const child: ChildProcess = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
        JWT_SECRET: jwtSecret,
        DB_FILE: tempDbPath,
        NODE_ENV: 'test',
        DISABLE_HMR: 'true',
        ...customEnv,
      },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  child.stderr?.on('data', (chunk) => {
    startupError += chunk.toString();
  });

  let serverStarted = false;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Wait for health check to pass
  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) {
        serverStarted = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!serverStarted) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Ignore kill error
    }
    throw new Error(`Test server failed to start on port ${port} within 15 seconds. Details: ${startupError}`);
  }

  const stop = async () => {
    return new Promise<void>((resolve) => {
      try {
        if (!child.killed) {
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              if (!child.killed) child.kill('SIGKILL');
            } catch {
              // ignore
            }
            resolve();
          }, 1500);
        } else {
          resolve();
        }
      } catch {
        resolve();
      } finally {
        try {
          fs.rmSync(tempDbDir, { recursive: true, force: true });
        } catch {
          // ignore cleanup error
        }
      }
    });
  };

  const request = async (endpoint: string, options: RequestInit = {}) => {
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const res = await fetch(url, options);
    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return {
      status: res.status,
      headers: res.headers,
      body,
      text,
    };
  };

  const login = async (identifier: string, password: string) => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (res.status !== 200 || !res.body?.token) {
      throw new Error(`Login failed for ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { token: res.body.token, user: res.body.user };
  };

  const authHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  return {
    port,
    baseUrl,
    jwtSecret,
    dbPath: tempDbPath,
    stop,
    request,
    login,
    authHeaders,
  };
}
