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
  _zvInited?: boolean;
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

// ── Migration flags ───────────────────────────────────────────────────────────
// Module-level flag — resets whenever db.ts is hot-reloaded by Next.js,
// unlike _zvInited which lives on globalThis and persists across hot-reloads.
// This ensures feature tables (events, members, payroll, reports) are always
// created/verified after a code change, even without a full server restart.
let _featureTablesMigrated = false;

export async function initDb() {
  // Feature tables: run once per module load (i.e. also after hot-reloads).
  // CREATE TABLE IF NOT EXISTS is idempotent — safe to repeat.
  if (!_featureTablesMigrated) {
    _featureTablesMigrated = true;

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

  // Guard: only run the full initialization (seeding, migrations) once per process lifetime.
  if (globalForDb._zvInited) return;
  globalForDb._zvInited = true;

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
    role: "super_admin" | "block_manager" | "hr" | "accounting";
    assignedBlockName: string | null;
  }> = [
    { username: "superadmin",   password: "SuperAdmin@123",   role: "super_admin",   assignedBlockName: null },
    { username: "blockmanager", password: "BlockManager@123", role: "block_manager", assignedBlockName: "D BLOCK" },
    { username: "hrmanager",    password: "HrManager@123",    role: "hr",            assignedBlockName: null },
    { username: "accountant",   password: "Accountant@123",   role: "accounting",    assignedBlockName: null },
  ];

  for (const demo of RBAC_DEMO_USERS) {
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
}

export { run, get, all };
