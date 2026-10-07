// lib/db.ts
export const runtime = "nodejs";

import { createClient } from "@libsql/client";
import type { InValue } from "@libsql/client";
import bcrypt from "bcryptjs";

// ── Singleton client ──────────────────────────────────────────────────────────
// Persists across hot-reloads in dev (globalThis scope).
// On Vercel: TURSO_DATABASE_URL points to a remote Turso DB (HTTP transport).
// Local dev: falls back to file:data.sqlite (same behaviour as before).
const globalForDb = globalThis as typeof globalThis & {
  _zvClient?: ReturnType<typeof createClient>;
};

if (!globalForDb._zvClient) {
  globalForDb._zvClient = createClient({
    url: process.env.TURSO_DATABASE_URL ?? "file:data.sqlite",
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

const db = globalForDb._zvClient;

// ── Query helpers ─────────────────────────────────────────────────────────────

async function run(sql: string, params: unknown[] = []) {
  await db.execute({ sql, args: params as InValue[] });
}

async function get<T = unknown>(sql: string, params: unknown[] = []) {
  const rs = await db.execute({ sql, args: params as InValue[] });
  return rs.rows.length ? (rs.rows[0] as unknown as T) : undefined;
}

async function all<T = unknown>(sql: string, params: unknown[] = []) {
  const rs = await db.execute({ sql, args: params as InValue[] });
  return rs.rows as unknown as T[];
}

// ── Schema version ────────────────────────────────────────────────────────────
// Every serverless cold start used to replay ~25 sequential migration queries
// against remote Turso before answering. Now a single version check gates them.
// BUMP THIS whenever you add/alter a table or seed below, so it runs once more.
const SCHEMA_VERSION = 3;

let _initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
  // Shared promise: concurrent requests on a cold instance wait on one init.
  if (!_initPromise) {
    _initPromise = ensureSchema().catch((e) => {
      _initPromise = null; // retry on the next request
      throw e;
    });
  }
  return _initPromise;
}

async function ensureSchema() {
  try {
    const row = await get<{ version: number }>(`SELECT version FROM schema_meta WHERE id = 1`);
    if ((row?.version ?? 0) >= SCHEMA_VERSION) return;
  } catch { /* schema_meta doesn't exist yet */ }

  await migrate();

  await run(`CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL)`);
  await run(
    `INSERT INTO schema_meta(id, version) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version`,
    [SCHEMA_VERSION]
  );
}

// Idempotent — every statement is safe to repeat.
async function migrate() {
  { // Feature tables (events, members, payroll, reports, truck income)
    await run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'general',
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth TEXT,
        date_joined TEXT,
        employee_id TEXT NOT NULL,
        block_id INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(block_id) REFERENCES blocks(id)
      )
    `);

    try { await run(`ALTER TABLE members ADD COLUMN photo_url TEXT`); } catch { /* already exists */ }

    await run(`
      CREATE TABLE IF NOT EXISTS member_payroll (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        salary REAL,
        payment_type TEXT,
        bonus REAL DEFAULT 0,
        deduction REAL DEFAULT 0,
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(member_id, year, month),
        FOREIGN KEY(member_id) REFERENCES members(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS monthly_member_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        submitted_by INTEGER NOT NULL,
        submitted_at TEXT NOT NULL,
        reviewed_by INTEGER,
        reviewed_at TEXT,
        review_note TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(submitted_by) REFERENCES users(id),
        FOREIGN KEY(reviewed_by) REFERENCES users(id)
      )
    `);

    // ACCOUNTING FINANCIAL SUMMARY — truck income per block per month
    await run(`
      CREATE TABLE IF NOT EXISTS truck_income (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_id INTEGER NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(block_id, year, month),
        FOREIGN KEY(block_id) REFERENCES blocks(id)
      )
    `);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','viewer','super_admin','block_manager','hr','accounting'))
    )
  `);

  // RBAC FEATURE — pre-existing installs created the `users` table with a
  // narrower CHECK(role IN ('admin','viewer')). SQLite can't ALTER a CHECK
  // constraint in place, so when that old constraint is detected we rebuild
  // the table (preserving every row/id) under the widened constraint above.
  try {
    const usersSchema = await get<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`
    );
    if (usersSchema?.sql && usersSchema.sql.includes("CHECK(role IN ('admin','viewer'))")) {
      await run(`ALTER TABLE users RENAME TO users_role_migration_old`);
      await run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin','viewer','super_admin','block_manager','hr','accounting'))
        )
      `);
      await run(`
        INSERT INTO users(id, username, password_hash, role)
        SELECT id, username, password_hash, role FROM users_role_migration_old
      `);
      await run(`DROP TABLE users_role_migration_old`);
      console.log("✅ Migrated users table to support extended RBAC roles");
    }
  } catch (e) {
    console.error("⚠️ users role migration check failed:", (e as Error).message);
  }

  // Migration: add avatar_url to pre-existing user tables that predate this column.
  try { await run(`ALTER TABLE users ADD COLUMN avatar_url TEXT`); } catch { /* exists */ }

  // RBAC FEATURE — additive columns supporting the new role system.
  try { await run(`ALTER TABLE users ADD COLUMN assigned_block_id INTEGER`); } catch { /* exists */ }
  try { await run(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`); } catch { /* exists */ }
  try { await run(`ALTER TABLE users ADD COLUMN last_login TEXT`); } catch { /* exists */ }

  await run(`
    CREATE TABLE IF NOT EXISTS prefs (
      user_id INTEGER PRIMARY KEY,
      theme_mode TEXT DEFAULT 'dark',
      accent TEXT DEFAULT '#0B7A4B',
      font_scale REAL DEFAULT 1.0,
      snow_enabled INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS month_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK(scope IN ('draft','published')),
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, year, month)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS publish_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      published_at TEXT NOT NULL
    )
  `);

  // Publish history: who published what, plus a snapshot so it can be restored.
  try { await run(`ALTER TABLE publish_log ADD COLUMN user_id INTEGER`); } catch { /* exists */ }
  try { await run(`ALTER TABLE publish_log ADD COLUMN username TEXT`); } catch { /* exists */ }
  try { await run(`ALTER TABLE publish_log ADD COLUMN kind TEXT`); } catch { /* exists */ }
  try { await run(`ALTER TABLE publish_log ADD COLUMN data_json TEXT`); } catch { /* exists */ }
  await run(`CREATE INDEX IF NOT EXISTS idx_publish_log_period ON publish_log(year, month, id)`);

  await run(`
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      team_members INTEGER NOT NULL DEFAULT 0,
      trucks INTEGER NOT NULL DEFAULT 0,
      starting_kpi REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Seed the registry from the original fixed block list if empty.
  const blockCount = await get<{ c: number }>(`SELECT COUNT(*) as c FROM blocks`);
  if ((blockCount?.c ?? 0) === 0) {
    const ts = new Date().toISOString();
    const ORIGINAL_BLOCK_NAMES = [
      "A BLOCK", "B BLOCK", "C BLOCK", "D BLOCK",
      "A1 BLOCK", "B1 BLOCK", "MO BLOCK", "FIRST B BLOCK",
    ];
    for (let i = 0; i < ORIGINAL_BLOCK_NAMES.length; i++) {
      await run(
        `INSERT INTO blocks(name, team_members, trucks, starting_kpi, notes, status, sort_order, created_at, updated_at)
         VALUES(?, 0, 0, 0, '', 'active', ?, ?, ?)`,
        [ORIGINAL_BLOCK_NAMES[i], i, ts, ts]
      );
    }
    console.log("✅ Seeded block registry with original 8 blocks");
  }

  // RBAC FEATURE — per-user draft changes for Block Managers / HR / Accounting.
  await run(`
    CREATE TABLE IF NOT EXISTS field_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      block_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      changes TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      UNIQUE(user_id, block_id, year, month)
    )
  `);

  // APPROVAL NOTIFICATIONS FEATURE
  await run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      draft_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(draft_id) REFERENCES field_drafts(id)
    )
  `);

  // Seed default accounts if empty
  const row = await get<{ c: number }>(`SELECT COUNT(*) as c FROM users`);
  if ((row?.c ?? 0) === 0) {
    const adminHash  = bcrypt.hashSync("Admin@12345",  10);
    const viewerHash = bcrypt.hashSync("Viewer@12345", 10);

    await run(`INSERT INTO users(username, password_hash, role) VALUES(?, ?, ?)`, ["admin",  adminHash,  "admin"]);
    await run(`INSERT INTO users(username, password_hash, role) VALUES(?, ?, ?)`, ["viewer", viewerHash, "viewer"]);

    const admin  = await get<{ id: number }>(`SELECT id FROM users WHERE username = 'admin'`);
    const viewer = await get<{ id: number }>(`SELECT id FROM users WHERE username = 'viewer'`);

    if (admin?.id)  await run(`INSERT OR IGNORE INTO prefs(user_id) VALUES(?)`, [admin.id]);
    if (viewer?.id) await run(`INSERT OR IGNORE INTO prefs(user_id) VALUES(?)`, [viewer.id]);

    console.log("✅ Seeded accounts: admin / Admin@12345  |  viewer / Viewer@12345");
  }

  // RBAC FEATURE — demo accounts for the four new roles.
  const RBAC_DEMO_USERS: Array<{
    username: string;
    password: string;
    role: "super_admin" | "block_manager";
    assignedBlockName: string | null;
  }> = [
    { username: "superadmin",   password: "SuperAdmin@123",   role: "super_admin",   assignedBlockName: null },
    { username: "blockmanager", password: "BlockManager@123", role: "block_manager", assignedBlockName: "D BLOCK" },
  ];

  // Demo accounts have publicly known passwords — never create them in production.
  for (const demo of process.env.NODE_ENV === "production" ? [] : RBAC_DEMO_USERS) {
    const existing = await get<{ id: number }>(`SELECT id FROM users WHERE username = ?`, [demo.username]);
    if (existing?.id) continue;

    let assignedBlockId: number | null = null;
    if (demo.assignedBlockName) {
      const block = await get<{ id: number }>(`SELECT id FROM blocks WHERE name = ?`, [demo.assignedBlockName]);
      assignedBlockId = block?.id ?? null;
    }

    const hash = bcrypt.hashSync(demo.password, 10);
    await run(
      `INSERT INTO users(username, password_hash, role, assigned_block_id, status) VALUES(?, ?, ?, ?, 'active')`,
      [demo.username, hash, demo.role, assignedBlockId]
    );
    const created = await get<{ id: number }>(`SELECT id FROM users WHERE username = ?`, [demo.username]);
    if (created?.id) await run(`INSERT OR IGNORE INTO prefs(user_id) VALUES(?)`, [created.id]);

    console.log(`✅ Seeded RBAC demo account: ${demo.username} / ${demo.password} (${demo.role})`);
  }

  // HR / Accounting are turned off for now (see DISABLED_ROLES in lib/auth.ts).
  // Disable rather than delete so their history stays intact.
  await run(`UPDATE users SET status = 'disabled' WHERE role IN ('hr', 'accounting')`);
}

// Runs `fn` inside one write transaction — use for read-modify-write updates
// (e.g. merging into a month's JSON) so concurrent requests can't lose changes.
type TxHelpers = { get: typeof get; run: typeof run };

async function withTransaction<T>(fn: (tx: TxHelpers) => Promise<T>): Promise<T> {
  const tx = await db.transaction("write");
  try {
    const helpers: TxHelpers = {
      run: async (sql, params = []) => { await tx.execute({ sql, args: params as InValue[] }); },
      get: async <R = unknown>(sql: string, params: unknown[] = []) => {
        const rs = await tx.execute({ sql, args: params as InValue[] });
        return rs.rows.length ? (rs.rows[0] as unknown as R) : undefined;
      },
    };
    const out = await fn(helpers);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}

// Records a publish-type event with a snapshot of the published month (for history/restore).
async function logPublish(
  tx: TxHelpers,
  e: { year: number; month: number; userId: number; username: string; kind: "publish" | "approve" | "restore"; at: string }
) {
  const cur = await tx.get<{ data_json: string }>(
    `SELECT data_json FROM month_results WHERE scope='published' AND year=? AND month=?`,
    [e.year, e.month]
  );
  await tx.run(
    `INSERT INTO publish_log(year, month, published_at, user_id, username, kind, data_json) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    [e.year, e.month, e.at, e.userId, e.username, e.kind, cur?.data_json ?? null]
  );
}

export { run, get, all, withTransaction, logPublish };
