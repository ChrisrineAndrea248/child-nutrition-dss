// =============================================================================
// Database layer — plain SQL via mysql2, no ORM.
//
// Every function here either talks to MySQL (when DATABASE_URL is set) using
// hand-written parameterized queries, or falls back to the local JSON store
// in server/_core/localStore.ts (used automatically when no DATABASE_URL is
// configured, e.g. for a quick local run without MySQL set up).
//
// The MySQL schema this file expects is defined in mysql-setup.sql at the
// project root — run that once in phpMyAdmin before setting DATABASE_URL.
// =============================================================================

import mysql from "mysql2/promise";
import type { InsertUser, User, UserRole } from "../shared/db-types";
import { ENV } from "./_core/env";
import { REGISTERABLE_ROLES, STATUS_TRANSITIONS, type AccountStatus } from "../shared/validation";
import {
  changeLocalUserPassword, createLocalManagedUser, deleteLocalUser, findLocalUserByOpenId, findLocalUserByEmail, hashPassword, verifyPassword, listLocalUsers, resetLocalUserPassword, updateLocalUserProfile, updateLocalUserRole,
  registerLocalUser, transitionLocalUserStatus, ensureLocalAdminSeed, LocalDuplicateAccountError, InvalidStatusTransitionError,
  createLocalOtp, verifyLocalOtp, consumeLocalOtp, resendLocalOtp, maskEmail,
  attemptLocalLogin,
} from "./_core/localUsers";
import { localCreateChild, localCreatePrediction, localCreateReport, localDeletePrediction, localDeleteChild, localGetChildByChildId, localGetLatestModelVersion, localGetPrediction, localListChildren, localListPredictions, localListReports, localUpdateChild, localListMaternalInformation, localSaveMaternalInformation, localUpdateMaternalInformation, localDeleteMaternalInformation, localListHouseholdInformation, localSaveHouseholdInformation, localUpdateHouseholdInformation, localDeleteHouseholdInformation,   localListHealthEnvironmentInformation, localSaveHealthEnvironmentInformation, localUpdateHealthEnvironmentInformation, localDeleteHealthEnvironmentInformation, localGetSettings, localSaveSetting, localCreateAuditLog, localListAuditLogs,
  localCreateNotification, localListNotifications, localGetUnreadNotificationCount, localMarkNotificationRead, localMarkAllNotificationsRead } from "./_core/localStore";

export { LocalDuplicateAccountError, InvalidStatusTransitionError };

// ─── Connection pool ───────────────────────────────────────────

let _pool: mysql.Pool | null = null;
export async function getDb(): Promise<mysql.Pool | null> {
  if (!_pool && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _pool = null;
    }
  }
  return _pool;
}

// ─── Small query helpers ───────────────────────────────────────
// JSON-typed columns get objects passed in and stringified back out
// automatically; mysql2 parses JSON columns back into objects on read.

function toSqlValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function buildInsert(table: string, data: Record<string, unknown>): { sql: string; values: unknown[] } {
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  const colList = cols.map((c) => `\`${c}\``).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const values = cols.map((c) => toSqlValue(data[c]));
  return { sql: `INSERT INTO \`${table}\` (${colList}) VALUES (${placeholders})`, values };
}

function buildUpdate(table: string, data: Record<string, unknown>, whereSql: string, whereValues: unknown[]): { sql: string; values: unknown[] } {
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  const setClause = cols.map((c) => `\`${c}\` = ?`).join(", ");
  const values = [...cols.map((c) => toSqlValue(data[c])), ...whereValues];
  return { sql: `UPDATE \`${table}\` SET ${setClause} WHERE ${whereSql}`, values };
}

function mapUserRow(row: any): User {
  return { ...row, mustChangePassword: !!row.mustChangePassword };
}

function isDuplicateEntryError(error: any): boolean {
  return error?.code === "ER_DUP_ENTRY" || String(error?.message ?? "").includes("Duplicate entry");
}

// ─── Users: session / profile ──────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return; // local-store users are managed entirely by localUsers.ts
  const data: Record<string, unknown> = { openId: user.openId };
  for (const field of ["name", "email", "loginMethod", "role", "status"] as const) {
    if (user[field] !== undefined) data[field] = user[field];
  }
  data.lastSignedIn = user.lastSignedIn ?? new Date();
  if (!data.role && user.openId === ENV.ownerOpenId) data.role = "admin";

  const { sql, values } = buildInsert("users", data);
  const updateCols = Object.keys(data).filter((c) => c !== "openId");
  const updateClause = updateCols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
  await db.query(`${sql} ON DUPLICATE KEY UPDATE ${updateClause}`, values);
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `openId` = ? LIMIT 1", [openId]);
    if (rows[0]) return mapUserRow(rows[0]);
  }
  return findLocalUserByOpenId(openId);
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    try {
      const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `id` = ? LIMIT 1", [id]);
      if (rows[0]) return mapUserRow(rows[0]);
    } catch {
      // fall through to local
    }
  }
  return (await listLocalUsers()).find((u: any) => u.id === id);
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE LOWER(`username`) = LOWER(?) LIMIT 1", [username]);
    return rows[0] ? mapUserRow(rows[0]) : undefined;
  }
  const rows = listLocalUsers();
  return rows.find((u: any) => (u.username ?? "").toLowerCase() === username.toLowerCase());
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (db) {
    const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE LOWER(`email`) = LOWER(?) LIMIT 1", [email]);
    return rows[0] ? mapUserRow(rows[0]) : undefined;
  }
  return findLocalUserByEmail(email);
}

/**
 * Verifies username-or-email + password against the actual active backend
 * (MySQL when connected, otherwise the local JSON fallback). This used to
 * always check only the local fallback even when MySQL was connected — fixed
 * so accounts created in MySQL (e.g. self-registered users) can log in.
 */
export async function attemptLogin(usernameOrEmail: string, password: string) {
  const db = await getDb();
  if (!db) return attemptLocalLogin(usernameOrEmail, password);

  const needle = usernameOrEmail.trim();
  const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `username` = ? OR LOWER(`email`) = LOWER(?) LIMIT 1", [needle, needle]);
  const row = rows[0];
  if (!row || !row.passwordHash || !verifyPassword(password, row.passwordHash)) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const status = (row.status ?? "active") as AccountStatus;
  if (status !== "active") {
    return { ok: false as const, reason: status };
  }
  await db.query("UPDATE `users` SET `lastSignedIn` = ? WHERE `id` = ?", [new Date(), row.id]);
  return { ok: true as const, user: mapUserRow({ ...row, lastSignedIn: new Date() }) };
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  if (db) {
    const [rows] = await db.query<any[]>("SELECT * FROM `users` ORDER BY `createdAt` DESC");
    return rows.map(mapUserRow);
  }
  return listLocalUsers() as any;
}

/** Administrator-created account (Users panel "Add User"). Created Active immediately, with a real username/password so it can sign in — no approval flow, since an Administrator created it directly. */
export async function createManagedUser(input: { username: string; password: string; email: string; name: string; role: UserRole }) {
  const db = await getDb();
  if (!db) return createLocalManagedUser(input);

  const [existingUsername] = await db.query<any[]>("SELECT id FROM `users` WHERE `username` = ? LIMIT 1", [input.username]);
  if (existingUsername[0]) throw new LocalDuplicateAccountError("username");
  const [existingEmail] = await db.query<any[]>("SELECT id FROM `users` WHERE LOWER(`email`) = LOWER(?) LIMIT 1", [input.email]);
  if (existingEmail[0]) throw new LocalDuplicateAccountError("email");

  const openId = `local:${input.username}`;
  try {
    const { sql, values } = buildInsert("users", {
      openId, username: input.username, passwordHash: hashPassword(input.password), email: input.email,
      name: input.name, role: input.role, status: "active", loginMethod: "local", mustChangePassword: false,
    });
    await db.query(sql, values);
  } catch (error: any) {
    if (isDuplicateEntryError(error)) throw new LocalDuplicateAccountError(String(error?.message).includes(input.email) ? "email" : "username");
    throw error;
  }
  const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `openId` = ? LIMIT 1", [openId]);
  return mapUserRow(rows[0]);
}

/**
 * Public self-registration (Nutrition Officer / Data Manager only). Always
 * lands the account in "pending" status — an Administrator must approve it.
 * Throws LocalDuplicateAccountError-style messages via a plain Error for the
 * router to translate into a friendly, non-leaking message.
 */
export async function registerUser(input: { username: string; password: string; email: string; name: string; role: (typeof REGISTERABLE_ROLES)[number] }) {
  const db = await getDb();
  if (!db) return registerLocalUser(input);

  const [existingUsername] = await db.query<any[]>("SELECT id FROM `users` WHERE `username` = ? LIMIT 1", [input.username]);
  if (existingUsername[0]) throw new LocalDuplicateAccountError("username");
  const [existingEmail] = await db.query<any[]>("SELECT id FROM `users` WHERE LOWER(`email`) = LOWER(?) LIMIT 1", [input.email]);
  if (existingEmail[0]) throw new LocalDuplicateAccountError("email");

  const openId = `local:${input.username}`;
  try {
    const { sql, values } = buildInsert("users", {
      openId, username: input.username, passwordHash: hashPassword(input.password), name: input.name,
      email: input.email, loginMethod: "local", role: input.role, status: "pending", mustChangePassword: false,
    });
    await db.query(sql, values);
  } catch (error: any) {
    // Guard against a race between the pre-check above and the insert (two
    // simultaneous registrations with the same username/email).
    if (isDuplicateEntryError(error)) throw new LocalDuplicateAccountError(String(error?.message).includes(input.email) ? "email" : "username");
    throw error;
  }
  const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `openId` = ? LIMIT 1", [openId]);
  return mapUserRow(rows[0]);
}

/**
 * Applies an Administrator account-status action, enforcing the same
 * from -> to state machine on both MySQL and the local JSON fallback.
 */
export async function transitionUserStatus(id: number, action: keyof typeof STATUS_TRANSITIONS) {
  const db = await getDb();
  if (!db) return transitionLocalUserStatus(id, action);

  const [rows] = await db.query<any[]>("SELECT * FROM `users` WHERE `id` = ? LIMIT 1", [id]);
  const row = rows[0];
  if (!row) throw new Error("User not found.");
  const transition = STATUS_TRANSITIONS[action];
  const currentStatus = (row.status ?? "active") as AccountStatus;
  if (!transition.from.includes(currentStatus)) throw new InvalidStatusTransitionError(action, currentStatus);

  await db.query("UPDATE `users` SET `status` = ? WHERE `id` = ?", [transition.to, id]);
  const [updatedRows] = await db.query<any[]>("SELECT * FROM `users` WHERE `id` = ? LIMIT 1", [id]);
  return mapUserRow(updatedRows[0]);
}

export async function setMustChangePassword(id: number, value: boolean) {
  const db = await getDb();
  if (db) {
    await db.query("UPDATE `users` SET `mustChangePassword` = ? WHERE `id` = ?", [value, id]);
    return;
  }
  // local path clears the flag as part of changeUserPassword
}

/**
 * Ensures exactly one Administrator account exists (username "Admin",
 * default password "Admin@123", forced password change on first login).
 * Called once at server startup (see _core/app.ts). No-ops once an admin
 * already exists — safe to call on every boot.
 */
export async function ensureAdminSeed() {
  const db = await getDb();
  if (!db) {
    ensureLocalAdminSeed();
    return;
  }
  const [existingAdmins] = await db.query<any[]>("SELECT id FROM `users` WHERE `role` = 'admin' LIMIT 1");
  if (existingAdmins.length > 0) return;

  const { sql, values } = buildInsert("users", {
    openId: "local:Admin", username: "Admin", passwordHash: hashPassword("Admin@123"),
    name: "System Administrator", email: "admin@nutrition-dss.org", loginMethod: "local",
    role: "admin", status: "active", mustChangePassword: true,
  });
  await db.query(sql, values);
  console.log("[Startup] Seeded initial Administrator account (username: Admin) — forced password change on first login.");
}

/**
 * Transitions pending registrations older than 30 days to "rejected" status.
 * Runs once at server startup (see _core/app.ts). Prevents unbounded
 * accumulation of stale pending accounts.
 */
export async function expireOldPendingAccounts() {
  const db = await getDb();
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (db) {
    const [result] = await db.query<any>(
      "UPDATE `users` SET `status` = 'rejected' WHERE `status` = 'pending' AND `createdAt` < ?",
      [threshold]
    );
    if (result.affectedRows > 0) {
      console.log(`[Startup] Expired ${result.affectedRows} pending account(s) older than 30 days.`);
      // Audit-log each expired account
      const [expired] = await db.query<any[]>(
        "SELECT id, openId, username FROM `users` WHERE `status` = 'rejected' AND `updatedAt` >= ? AND `createdAt` < ?",
        [threshold, threshold]
      );
      for (const row of expired) {
        const { sql, values } = buildInsert("audit_logs", {
          userId: row.id,
          action: "user.pending_expired",
          entity: "user",
          entityId: row.openId,
          metadata: JSON.stringify({ username: row.username }),
        });
        await db.query(sql, values).catch(() => {});
      }
    }
    return;
  }
  // Local store: no-op (local users don't accumulate the same way)
}

/**
 * One-time migration: re-pad narrow childId values (e.g. CH-2024-01, CH-2024-1)
 * to 5-digit zero-padded format (CH-2024-00001). Idempotent — safe to run on
 * every boot. Never renumbers, reassigns, or duplicates an ID. Skips IDs that
 * are already 5-digit padded.
 */
export async function migrateChildIdPadding() {
  const db = await getDb();
  // Match CH-YYYY-N or CH-YYYY-NN (1-2 digit suffix, no leading zeros beyond 2)
  const narrowPattern = /^CH-(\d{4})-(\d{1,2})$/;

  if (db) {
    const [rows] = await db.query<any[]>("SELECT `id`, `childId` FROM `children`");
    let migrated = 0;
    for (const row of rows) {
      const match = String(row.childId).match(narrowPattern);
      if (match) {
        const year = match[1];
        const num = parseInt(match[2], 10);
        const newId = `CH-${year}-${String(num).padStart(5, "0")}`;
        if (newId !== row.childId) {
          await db.query("UPDATE `children` SET `childId` = ? WHERE `id` = ?", [newId, row.id]);
          migrated++;
        }
      }
    }
    if (migrated > 0) {
      console.log(`[Startup] Migrated ${migrated} child ID(s) to 5-digit padding.`);
    }
    return;
  }

  // Local store migration
  const { localMigrateChildIdPadding } = await import("./_core/localStore");
  const migrated = localMigrateChildIdPadding();
  if (migrated > 0) {
    console.log(`[Startup] Migrated ${migrated} child ID(s) to 5-digit padding (local store).`);
  }
}

export async function updateUserRole(id: number, role: UserRole) {
  const db = await getDb();
  if (db) {
    await db.query("UPDATE `users` SET `role` = ? WHERE `id` = ?", [role, id]);
    return;
  }
  updateLocalUserRole(id, role);
}

export async function resetUserPassword(id: number, password: string) {
  const db = await getDb();
  if (db) {
    const [rows] = await db.query<any[]>("SELECT id, `passwordHash` FROM `users` WHERE `id` = ? LIMIT 1", [id]);
    if (rows[0]) {
      const currentHash = rows[0].passwordHash;
      if (currentHash) await pushPasswordHistory(id, currentHash);
      await db.query("UPDATE `users` SET `passwordHash` = ? WHERE `id` = ?", [hashPassword(password), id]);
      return;
    }
  }
  resetLocalUserPassword(id, password);
}

export async function deleteUser(id: number) {
  const db = await getDb();
  if (db) {
    await db.query("DELETE FROM `users` WHERE `id` = ?", [id]);
    return;
  }
  deleteLocalUser(id);
}

export async function updateUserProfile(openId: string, input: Partial<{ name: string; email: string; phone: string; title: string }>) {
  const db = await getDb();
  if (db) {
    const { sql, values } = buildUpdate("users", input, "`openId` = ?", [openId]);
    await db.query(sql, values);
    return;
  }
  return updateLocalUserProfile(openId, input);
}

export async function changeUserPassword(openId: string, newPassword: string) {
  const db = await getDb();
  if (db) {
    const newHash = hashPassword(newPassword);
    // Push current hash into history before overwriting
    const [rows] = await db.query<any[]>("SELECT `passwordHistory` FROM `users` WHERE `openId` = ? LIMIT 1", [openId]);
    const history: string[] = rows[0]?.passwordHistory ? JSON.parse(String(rows[0].passwordHistory)) : [];
    history.unshift(newHash);
    const trimmed = history.slice(0, 5);
    await db.query("UPDATE `users` SET `passwordHash` = ?, `passwordHistory` = ?, `mustChangePassword` = FALSE WHERE `openId` = ?", [newHash, JSON.stringify(trimmed), openId]);
    return;
  }
  changeLocalUserPassword(openId, newPassword);
}

// ─── Password history helpers ─────────────────────────────────

/** Maximum number of previous passwords to retain for reuse checks. */
const PASSWORD_HISTORY_LIMIT = 5;

/** Returns the last N password hashes for a user (MySQL only). */
export async function getPasswordHistory(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const [rows] = await db.query<any[]>("SELECT `passwordHistory` FROM `users` WHERE `id` = ? LIMIT 1", [userId]);
  if (!rows[0]?.passwordHistory) return [];
  try {
    return JSON.parse(String(rows[0].passwordHistory));
  } catch {
    return [];
  }
}

/**
 * Pushes the current hash onto the password history (keeps last 5).
 * Call this BEFORE updating passwordHash when doing a password change.
 * MySQL only — no-ops for local store.
 */
export async function pushPasswordHistory(userId: number, currentHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [rows] = await db.query<any[]>("SELECT `passwordHistory` FROM `users` WHERE `id` = ? LIMIT 1", [userId]);
  const history: string[] = rows[0]?.passwordHistory ? JSON.parse(String(rows[0].passwordHistory)) : [];
  history.unshift(currentHash);
  const trimmed = history.slice(0, PASSWORD_HISTORY_LIMIT);
  await db.query("UPDATE `users` SET `passwordHistory` = ? WHERE `id` = ?", [JSON.stringify(trimmed), userId]);
}

// ─── Password reset OTPs ─────────────────────────────────────

const OTP_TTL_MS = 7 * 60 * 1000; // 7 minutes
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds
const MAX_RESENDS = 4;

import { createHash } from "node:crypto";

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Mask email for safe display: shows only last few chars of local part + domain. */
export { maskEmail } from "./_core/localUsers";

/**
 * Find a user by username or email — reuses the exact same lookup as login.
 */
async function findUserByIdentifier(identifier: string): Promise<{ id: number; email: string; openId: string } | null> {
  const db = await getDb();
  const needle = identifier.trim();
  if (db) {
    try {
      const [rows] = await db.query<any[]>(
        "SELECT id, email, openId FROM `users` WHERE `username` = ? OR LOWER(`email`) = LOWER(?) LIMIT 1",
        [needle, needle]
      );
      if (rows[0]) return rows[0];
    } catch (error) {
      console.warn("[OTP] MySQL findUserByIdentifier failed, falling back to local:", error);
    }
  }
  // Local fallback
  const localUsers = await import("./_core/localUsers");
  const byUsername = localUsers.findLocalUserByUsername(needle);
  if (byUsername) return { id: byUsername.id, email: byUsername.email ?? "", openId: byUsername.openId };
  if (needle.includes("@")) {
    const byEmail = localUsers.findLocalUserByEmail(needle);
    if (byEmail) return { id: byEmail.id, email: byEmail.email ?? "", openId: byEmail.openId };
  }
  return null;
}

/**
 * Step 1: Request an OTP (forgot password).
 * Accepts username or email. Returns masked email hint if account found.
 */
export async function createOtp(identifier: string) {
  const db = await getDb();

  // Try MySQL first when available
  if (db) {
    try {
      const user = await findUserByIdentifier(identifier);
      if (user && String(user.openId).startsWith("local:")) {
        // Invalidate any existing active OTP for this user
        const [existing] = await db.query<any[]>(
          "SELECT id FROM `password_reset_otps` WHERE `userId` = ? AND `usedAt` IS NULL AND `expiresAt` > NOW() LIMIT 1",
          [user.id]
        );
        if (existing[0]) {
          await db.query("UPDATE `password_reset_otps` SET `usedAt` = NOW() WHERE `id` = ?", [existing[0].id]);
        }

        const otp = generateOtp();
        const otpHashed = hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        const { sql, values } = buildInsert("password_reset_otps", { userId: user.id, otpHash: otpHashed, expiresAt, attempts: 0, resendCount: 0 });
        const [result] = await db.query<mysql.ResultSetHeader>(sql, values);
        const masked = maskEmail(user.email ?? "");

        return { ok: true as const, otpId: result.insertId, userId: user.id, maskedEmail: masked, otp };
      }
    } catch (error) {
      console.warn("[OTP] MySQL query failed, falling back to local store:", error);
    }
  }

  // Fall back to local store
  return createLocalOtp(identifier);
}

/**
 * Step 2: Verify an OTP.
 * Returns { verified: true, otpId } on success, or error reason.
 */
export async function verifyOtp(otpId: number, otpInput: string) {
  const db = await getDb();

  if (db) {
    try {
      const [rows] = await db.query<any[]>("SELECT * FROM `password_reset_otps` WHERE `id` = ? LIMIT 1", [otpId]);
      const row = rows[0];
      if (row) {
        if (row.usedAt) return { ok: false as const, reason: "used" as const };
        if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false as const, reason: "expired" as const };

        const attempts = (row.attempts ?? 0) + 1;
        if (attempts >= MAX_OTP_ATTEMPTS) {
          await db.query("UPDATE `password_reset_otps` SET `usedAt` = NOW(), `attempts` = ? WHERE `id` = ?", [attempts, otpId]);
          return { ok: false as const, reason: "too_many_attempts" as const };
        }

        if (hashOtp(otpInput) !== row.otpHash) {
          await db.query("UPDATE `password_reset_otps` SET `attempts` = ? WHERE `id` = ?", [attempts, otpId]);
          return { ok: false as const, reason: "invalid_otp" as const };
        }

        await db.query("UPDATE `password_reset_otps` SET `verifiedAt` = NOW(), `attempts` = ? WHERE `id` = ?", [attempts, otpId]);
        return { ok: true as const, otpId: row.id, userId: row.userId };
      }
    } catch (error) {
      console.warn("[OTP] MySQL verifyOtp failed, falling back to local:", error);
    }
  }

  return verifyLocalOtp(otpId, otpInput);
}

/**
 * Step 3: Consume a verified OTP and set a new password.
 */
export async function consumeOtp(otpId: number, newPassword: string) {
  const db = await getDb();

  if (db) {
    try {
      const [rows] = await db.query<any[]>("SELECT * FROM `password_reset_otps` WHERE `id` = ? LIMIT 1", [otpId]);
      const row = rows[0];
      if (row) {
        if (row.usedAt) return { ok: false as const, reason: "used" as const };
        if (!row.verifiedAt) return { ok: false as const, reason: "not_verified" as const };
        if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false as const, reason: "expired" as const };

        // Push current hash into history before overwriting
        const [userRows] = await db.query<any[]>("SELECT `passwordHash` FROM `users` WHERE `id` = ? LIMIT 1", [row.userId]);
        if (userRows[0]?.passwordHash) await pushPasswordHistory(row.userId, userRows[0].passwordHash);

        await db.query("UPDATE `users` SET `passwordHash` = ?, `mustChangePassword` = FALSE WHERE `id` = ?", [hashPassword(newPassword), row.userId]);
        await db.query("UPDATE `password_reset_otps` SET `usedAt` = NOW() WHERE `id` = ?", [otpId]);
        return { ok: true as const, userId: row.userId };
      }
    } catch (error) {
      console.warn("[OTP] MySQL consumeOtp failed, falling back to local:", error);
    }
  }

  return consumeLocalOtp(otpId, newPassword);
}

/**
 * Resend OTP: invalidates the old one, generates a new one.
 */
export async function resendOtp(otpId: number) {
  const db = await getDb();

  if (db) {
    try {
      const [rows] = await db.query<any[]>("SELECT * FROM `password_reset_otps` WHERE `id` = ? LIMIT 1", [otpId]);
      const row = rows[0];
      if (row) {
        if (row.usedAt) return { ok: false as const, reason: "used" as const };

        const resendCount = (row.resendCount ?? 0) + 1;
        if (resendCount > MAX_RESENDS) {
          await db.query("UPDATE `password_reset_otps` SET `usedAt` = NOW() WHERE `id` = ?", [otpId]);
          return { ok: false as const, reason: "max_resends_reached" as const };
        }

        // Check cooldown
        const lastCreated = new Date(row.createdAt).getTime();
        if (Date.now() - lastCreated < RESEND_COOLDOWN_MS) {
          const remaining = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastCreated)) / 1000);
          return { ok: false as const, reason: "cooldown" as const, remaining };
        }

        // Invalidate old OTP
        await db.query("UPDATE `password_reset_otps` SET `usedAt` = NOW() WHERE `id` = ?", [otpId]);

        // Generate new OTP
        const otp = generateOtp();
        const otpHashed = hashOtp(otp);
        const expiresAt = new Date(Date.now() + OTP_TTL_MS);
        const { sql, values } = buildInsert("password_reset_otps", { userId: row.userId, otpHash: otpHashed, expiresAt, attempts: 0, resendCount });
        const [result] = await db.query<mysql.ResultSetHeader>(sql, values);

        // Get masked email
        const [userRows] = await db.query<any[]>("SELECT email FROM `users` WHERE `id` = ? LIMIT 1", [row.userId]);
        const masked = maskEmail(userRows[0]?.email ?? "");

        return { ok: true as const, otpId: result.insertId, userId: row.userId, maskedEmail: masked, otp };
      }
    } catch (error) {
      console.warn("[OTP] MySQL resendOtp failed, falling back to local:", error);
    }
  }

  return resendLocalOtp(otpId);
}

/**
 * Update a user's email (admin action).
 */
export async function updateUserEmail(userId: number, newEmail: string) {
  const db = await getDb();
  if (db) {
    await db.query("UPDATE `users` SET `email` = ? WHERE `id` = ?", [newEmail, userId]);
    return;
  }
  // Local fallback
  const { localUpdateUser } = await import("./_core/localStore");
  localUpdateUser(userId, { email: newEmail });
}

// ─── Children ───────────────────────────────────────────────────

export async function createChild(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localCreateChild(input as any);
  const { sql, values } = buildInsert("children", input);
  return db.query(sql, values);
}

export async function listChildren() {
  const db = await getDb();
  if (!db) return localListChildren();
  const [rows] = await db.query<any[]>("SELECT * FROM `children` ORDER BY `createdAt` DESC");
  return rows;
}

export async function updateChild(childId: string, input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localUpdateChild(childId, input);
  const { sql, values } = buildUpdate("children", input, "`childId` = ?", [childId]);
  return db.query(sql, values);
}

export async function deleteChild(childId: string) {
  const db = await getDb();
  if (!db) return localDeleteChild(childId);
  return db.query("DELETE FROM `children` WHERE `childId` = ?", [childId]);
}

export async function getChildByChildId(childId: string) {
  const db = await getDb();
  if (!db) return localGetChildByChildId(childId);
  const [rows] = await db.query<any[]>("SELECT * FROM `children` WHERE `childId` = ? LIMIT 1", [childId]);
  return rows[0];
}

export async function getNextChildId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CH-${year}-`;
  const db = await getDb();
  if (!db) {
    const all = localListChildren();
    const thisYear = all.filter((c: any) => String(c.childId).startsWith(prefix));
    const maxNum = thisYear.reduce((max: number, c: any) => {
      const suffix = String(c.childId).slice(prefix.length);
      const num = parseInt(suffix, 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
  }
  const [rows] = await db.query<any[]>("SELECT `childId` FROM `children` WHERE `childId` LIKE ?", [`${prefix}%`]);
  let maxNum = 0;
  for (const row of rows) {
    const suffix = String(row.childId).slice(prefix.length);
    const num = parseInt(suffix, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return `${prefix}${String(maxNum + 1).padStart(5, "0")}`;
}

export async function getChildWithAllData(childId: string) {
  const child = await getChildByChildId(childId);
  if (!child) return null;
  const db = await getDb();
  const [maternal, household, healthEnv, preds] = await Promise.all([
    listMaternalInformation(child.id),
    listHouseholdInformation(child.id),
    listHealthEnvironmentInformation(child.id),
    db
      ? db.query<any[]>("SELECT * FROM `predictions` WHERE `childId` = ? ORDER BY `createdAt` DESC", [child.id]).then(([rows]) => rows)
      : (await listPredictions()).filter((p: any) => p.childId === child.id),
  ]);
  return { child, maternal, household, healthEnvironment: healthEnv, predictions: preds };
}

// ─── Maternal / household / health-environment information ────

export async function listMaternalInformation(childId?: number) {
  const db = await getDb();
  if (!db) return localListMaternalInformation(childId);
  if (childId) {
    const [rows] = await db.query<any[]>("SELECT * FROM `maternal_information` WHERE `childId` = ? ORDER BY `createdAt` DESC", [childId]);
    return rows;
  }
  const [rows] = await db.query<any[]>("SELECT * FROM `maternal_information` ORDER BY `createdAt` DESC");
  return rows;
}
export async function saveMaternalInformation(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localSaveMaternalInformation(input as any);
  const { sql, values } = buildInsert("maternal_information", input);
  return db.query(sql, values);
}
export async function updateMaternalInformation(id: number, data: unknown) {
  const db = await getDb();
  if (!db) return localUpdateMaternalInformation(id, data);
  const { sql, values } = buildUpdate("maternal_information", { data }, "`id` = ?", [id]);
  return db.query(sql, values);
}
export async function deleteMaternalInformation(id: number) {
  const db = await getDb();
  if (!db) return localDeleteMaternalInformation(id);
  return db.query("DELETE FROM `maternal_information` WHERE `id` = ?", [id]);
}

export async function listHouseholdInformation(childId?: number) {
  const db = await getDb();
  if (!db) return localListHouseholdInformation(childId);
  if (childId) {
    const [rows] = await db.query<any[]>("SELECT * FROM `household_information` WHERE `childId` = ? ORDER BY `createdAt` DESC", [childId]);
    return rows;
  }
  const [rows] = await db.query<any[]>("SELECT * FROM `household_information` ORDER BY `createdAt` DESC");
  return rows;
}
export async function saveHouseholdInformation(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localSaveHouseholdInformation(input as any);
  const { sql, values } = buildInsert("household_information", input);
  return db.query(sql, values);
}
export async function updateHouseholdInformation(id: number, data: unknown) {
  const db = await getDb();
  if (!db) return localUpdateHouseholdInformation(id, data);
  const { sql, values } = buildUpdate("household_information", { data }, "`id` = ?", [id]);
  return db.query(sql, values);
}
export async function deleteHouseholdInformation(id: number) {
  const db = await getDb();
  if (!db) return localDeleteHouseholdInformation(id);
  return db.query("DELETE FROM `household_information` WHERE `id` = ?", [id]);
}

export async function listHealthEnvironmentInformation(childId?: number) {
  const db = await getDb();
  if (!db) return localListHealthEnvironmentInformation(childId);
  if (childId) {
    const [rows] = await db.query<any[]>("SELECT * FROM `health_environment_information` WHERE `childId` = ? ORDER BY `createdAt` DESC", [childId]);
    return rows;
  }
  const [rows] = await db.query<any[]>("SELECT * FROM `health_environment_information` ORDER BY `createdAt` DESC");
  return rows;
}
export async function saveHealthEnvironmentInformation(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localSaveHealthEnvironmentInformation(input as any);
  const { sql, values } = buildInsert("health_environment_information", input);
  return db.query(sql, values);
}
export async function updateHealthEnvironmentInformation(id: number, data: unknown) {
  const db = await getDb();
  if (!db) return localUpdateHealthEnvironmentInformation(id, data);
  const { sql, values } = buildUpdate("health_environment_information", { data }, "`id` = ?", [id]);
  return db.query(sql, values);
}
export async function deleteHealthEnvironmentInformation(id: number) {
  const db = await getDb();
  if (!db) return localDeleteHealthEnvironmentInformation(id);
  return db.query("DELETE FROM `health_environment_information` WHERE `id` = ?", [id]);
}

// ─── Predictions / reports / model versions ────────────────────

export async function listPredictions(search?: string) {
  const db = await getDb();
  if (!db) return localListPredictions(search);
  if (search) {
    const [rows] = await db.query<any[]>(
      "SELECT p.*, c.`childId` AS `childIdStr` FROM `predictions` p LEFT JOIN `children` c ON p.`childId` = c.`id` WHERE p.`predictionId` LIKE ? ORDER BY p.`createdAt` DESC",
      [`%${search}%`]
    );
    return rows;
  }
  const [rows] = await db.query<any[]>(
    "SELECT p.*, c.`childId` AS `childIdStr` FROM `predictions` p LEFT JOIN `children` c ON p.`childId` = c.`id` ORDER BY p.`createdAt` DESC"
  );
  return rows;
}
export async function createPrediction(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localCreatePrediction(input as any);
  const { sql, values } = buildInsert("predictions", input);
  return db.query(sql, values);
}
export async function getPrediction(predictionId: string) {
  const db = await getDb();
  if (!db) return localGetPrediction(predictionId);
  const [rows] = await db.query<any[]>("SELECT * FROM `predictions` WHERE `predictionId` = ? LIMIT 1", [predictionId]);
  return rows[0];
}
export async function deletePrediction(predictionId: string) {
  const db = await getDb();
  if (!db) return localDeletePrediction(predictionId);
  return db.query("DELETE FROM `predictions` WHERE `predictionId` = ?", [predictionId]);
}

export async function createReport(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localCreateReport(input as any);
  const { sql, values } = buildInsert("reports", input);
  return db.query(sql, values);
}
export async function listReports() {
  const db = await getDb();
  if (!db) return localListReports();
  const [rows] = await db.query<any[]>("SELECT * FROM `reports` ORDER BY `createdAt` DESC");
  return rows;
}

export async function getLatestModelVersion() {
  const db = await getDb();
  if (!db) return localGetLatestModelVersion();
  const [rows] = await db.query<any[]>("SELECT * FROM `model_versions` ORDER BY `createdAt` DESC LIMIT 1");
  return rows[0];
}

// ─── Settings / audit logs ──────────────────────────────────────

export async function saveSetting(key: string, value: string, updatedBy?: number) {
  const db = await getDb();
  if (!db) return localSaveSetting(key, value, updatedBy);
  await db.query(
    "INSERT INTO `system_settings` (`key`, `value`, `updatedBy`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updatedBy` = VALUES(`updatedBy`)",
    [key, value, updatedBy ?? null]
  );
}
export async function getSettings() {
  const db = await getDb();
  if (!db) return localGetSettings();
  const [rows] = await db.query<any[]>("SELECT * FROM `system_settings`");
  return rows;
}

export async function createAuditLog(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localCreateAuditLog(input as any);
  const { sql, values } = buildInsert("audit_logs", input);
  return db.query(sql, values);
}

export async function listAuditLogs(limit = 300) {
  const db = await getDb();
  if (!db) return localListAuditLogs();
  const [rows] = await db.query<any[]>(
    "SELECT a.*, u.name AS userName, u.username AS username FROM `audit_logs` a LEFT JOIN `users` u ON u.id = a.userId ORDER BY a.`createdAt` DESC LIMIT ?",
    [limit]
  );
  return rows;
}

// ─── Notifications ─────────────────────────────────────────────

export async function createNotification(input: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return localCreateNotification(input as any);
  const { read: _read, ...rest } = input;
  const mapped = { ...rest, isRead: _read ?? false };
  const { sql, values } = buildInsert("notifications", mapped);
  const [result] = await db.query<mysql.ResultSetHeader>(sql, values);
  return { id: result.insertId, ...input };
}

export async function listNotifications(userId: number) {
  const db = await getDb();
  if (!db) return localListNotifications(userId);
  const [rows] = await db.query<any[]>(
    "SELECT *, `isRead` AS `read` FROM `notifications` WHERE `userId` = ? ORDER BY `createdAt` DESC",
    [userId]
  );
  return rows;
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return localGetUnreadNotificationCount(userId);
  const [rows] = await db.query<any[]>(
    "SELECT COUNT(*) AS cnt FROM `notifications` WHERE `userId` = ? AND `isRead` = 0",
    [userId]
  );
  return rows[0]?.cnt ?? 0;
}

export async function markNotificationRead(id: number, userId: number) {
  const db = await getDb();
  if (!db) return localMarkNotificationRead(id, userId);
  await db.query(
    "UPDATE `notifications` SET `isRead` = 1 WHERE `id` = ? AND `userId` = ?",
    [id, userId]
  );
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return localMarkAllNotificationsRead(userId);
  await db.query(
    "UPDATE `notifications` SET `isRead` = 1 WHERE `userId` = ? AND `isRead` = 0",
    [userId]
  );
}
