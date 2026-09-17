import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { User } from "../../shared/db-types";
import { REGISTERABLE_ROLES, STATUS_TRANSITIONS, type AccountStatus } from "../../shared/validation";
import {
  localListUsers,
  localGetUserByOpenId,
  localGetUserByUsername,
  localGetUserByEmail,
  localGetUserById,
  localCreateUser,
  localUpdateUser,
  localDeleteUser,
  localUpsertUser,
  localCreatePasswordResetToken,
  localGetPasswordResetTokenByHash,
  localMarkPasswordResetTokenUsed,
  localCreatePasswordResetOtp,
  localGetPasswordResetOtpById,
  localGetPasswordResetOtpByHash,
  localGetActiveOtpForUser,
  localUpdatePasswordResetOtp,
} from "./localStore";

// =============================================================================
// Local username/password authentication store.
//
// Users are persisted to data/store.json via localStore. Seed users are
// loaded only when no users exist in the store. Passwords are stored as
// scrypt salted hashes (never plaintext).
// =============================================================================

type SeedUser = {
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  role: User["role"];
};

const LOCAL_OPEN_ID_PREFIX = "local:";

const SEED_USERS: SeedUser[] = [
  {
    username: "Admin",
    password: "Admin@123",
    name: "System Administrator",
    email: "admin@nutrition-dss.org",
    phone: "+255 700 000 001",
    title: "System Administrator",
    role: "admin",
  },
  {
    username: "Saida.lojong",
    password: "Lojong@123",
    name: "Saida Lojong",
    email: "saida.lojong@nutrition-dss.org",
    phone: "+255 700 000 002",
    title: "Senior Nutrition Officer",
    role: "nutrition_officer",
  },
  {
    username: "officer.james",
    password: "James@123",
    name: "James Mwakalukwa",
    email: "james@nutrition-dss.org",
    phone: "+255 700 000 003",
    title: "Nutrition Officer",
    role: "nutrition_officer",
  },
  {
    username: "officer.amina",
    password: "Amina@123",
    name: "Amina Hassan",
    email: "amina@nutrition-dss.org",
    phone: "+255 700 000 004",
    title: "Nutrition Officer",
    role: "nutrition_officer",
  },
  {
    username: "data.mary",
    password: "Mary@123",
    name: "Mary Nyerere",
    email: "mary@nutrition-dss.org",
    phone: "+255 700 000 005",
    title: "Data Manager",
    role: "data_manager",
  },
];

let seeded = false;

function ensureSeeded(): void {
  if (seeded) return;
  seeded = true;
  const existing = localListUsers();
  if (existing.length > 0) return;
  for (const seed of SEED_USERS) {
    localCreateUser({
      openId: toOpenId(seed.username),
      username: seed.username,
      passwordHash: hashPassword(seed.password),
      name: seed.name,
      email: seed.email,
      phone: seed.phone,
      title: seed.title,
      loginMethod: "local",
      role: seed.role,
      status: "active",
      // The seeded Administrator must change the default password on first login.
      // Demo Nutrition Officer / Data Manager seed accounts do not require this.
      mustChangePassword: seed.role === "admin",
    });
  }
}

/**
 * Ensures exactly one local Administrator account exists (username "Admin",
 * default password "Admin@123", forced password change on first login). Safe
 * to call multiple times — it's a no-op once an admin exists. This mirrors
 * the system-initialization seed described in the user-management spec, and
 * runs for the local JSON fallback store the same way ensureAdminSeed() in
 * db.ts runs it for MySQL.
 */
export function ensureLocalAdminSeed(): void {
  ensureSeeded();
  const hasAdmin = localListUsers().some((u) => u.role === "admin");
  if (hasAdmin) return;
  const seed = SEED_USERS[0];
  localCreateUser({
    openId: toOpenId(seed.username),
    username: seed.username,
    passwordHash: hashPassword(seed.password),
    name: seed.name,
    email: seed.email,
    phone: seed.phone,
    title: seed.title,
    loginMethod: "local",
    role: "admin",
    status: "active",
    mustChangePassword: true,
  });
}

function toOpenId(username: string): string {
  return `${LOCAL_OPEN_ID_PREFIX}${username}`;
}

function rowToUser(row: Record<string, any>): User {
  return {
    id: row.id,
    openId: row.openId,
    username: row.username ?? null,
    passwordHash: row.passwordHash ?? null,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    title: row.title ?? null,
    avatar: row.avatar ?? null,
    loginMethod: row.loginMethod ?? null,
    role: row.role,
    status: row.status ?? "active",
    mustChangePassword: row.mustChangePassword ?? false,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    lastSignedIn: row.lastSignedIn ? new Date(row.lastSignedIn) : new Date(),
    lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt) : new Date(),
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected)
  );
}

export function findLocalUserByOpenId(openId: string): User | undefined {
  ensureSeeded();
  const row = localGetUserByOpenId(openId);
  return row ? rowToUser(row) : undefined;
}

export function findLocalUserByUsername(username: string): User | undefined {
  ensureSeeded();
  const row = localGetUserByUsername(username);
  return row ? rowToUser(row) : undefined;
}

export function findLocalUserByEmail(email: string): User | undefined {
  ensureSeeded();
  const row = localGetUserByEmail(email);
  return row ? rowToUser(row) : undefined;
}

export type LocalLoginResult =
  | { ok: true; user: User }
  | { ok: false; reason: "invalid" | AccountStatus };

/**
 * Verifies username-or-email + password. Unlike the old verifyLocalCredentials,
 * this reports *why* a login failed (wrong credentials vs. a non-active account
 * status) so the caller can show the specific, safe messages the spec requires
 * — without ever revealing whether a *username* exists for a wrong password.
 */
export function attemptLocalLogin(usernameOrEmail: string, password: string): LocalLoginResult {
  ensureSeeded();
  const needle = usernameOrEmail.trim();
  const row = localGetUserByUsername(needle) ?? (needle.includes("@") ? localGetUserByEmail(needle) : undefined);
  if (!row || !row.passwordHash || !verifyPassword(password, row.passwordHash)) {
    return { ok: false, reason: "invalid" };
  }
  const status: AccountStatus = row.status ?? "active";
  if (status !== "active") {
    return { ok: false, reason: status };
  }
  localUpdateUser(row.id, { lastSignedIn: new Date().toISOString(), lastActiveAt: new Date().toISOString() });
  return { ok: true, user: rowToUser({ ...row, lastSignedIn: new Date().toISOString(), lastActiveAt: new Date().toISOString() }) };
}

/** @deprecated use attemptLocalLogin, which reports the reason for a failed login. */
export function verifyLocalCredentials(username: string, password: string): User | null {
  const result = attemptLocalLogin(username, password);
  return result.ok ? result.user : null;
}

export function listLocalUsers(): User[] {
  ensureSeeded();
  return localListUsers().map(rowToUser);
}

export type LocalDuplicateField = "username" | "email";
export class LocalDuplicateAccountError extends Error {
  field: LocalDuplicateField;
  constructor(field: LocalDuplicateField) {
    super(field === "username" ? "This username is already in use. Please choose another username." : "An account with this email already exists.");
    this.field = field;
  }
}

function assertUsernameAndEmailAvailable(username: string, email: string): void {
  if (localGetUserByUsername(username)) throw new LocalDuplicateAccountError("username");
  if (localGetUserByEmail(email)) throw new LocalDuplicateAccountError("email");
}

/** Administrator-created account (from the Users panel). Created Active immediately — no approval needed, since an Administrator is creating it directly. */
export function createLocalManagedUser(input: {
  username: string;
  password: string;
  email: string;
  name: string;
  role: User["role"];
}): User {
  ensureSeeded();
  assertUsernameAndEmailAvailable(input.username, input.email);
  const row = localCreateUser({
    openId: toOpenId(input.username),
    username: input.username,
    passwordHash: hashPassword(input.password),
    name: input.name,
    email: input.email,
    loginMethod: "local",
    role: input.role,
    status: "active",
    mustChangePassword: false,
  });
  return rowToUser(row);
}

/** Public self-registration (Nutrition Officer / Data Manager only). Always created Pending — requires Administrator approval before the account can log in. */
export function registerLocalUser(input: {
  username: string;
  password: string;
  email: string;
  name: string;
  role: (typeof REGISTERABLE_ROLES)[number];
}): User {
  ensureSeeded();
  if (!REGISTERABLE_ROLES.includes(input.role)) {
    throw new Error("Please select a valid role.");
  }
  assertUsernameAndEmailAvailable(input.username, input.email);
  const row = localCreateUser({
    openId: toOpenId(input.username),
    username: input.username,
    passwordHash: hashPassword(input.password),
    name: input.name,
    email: input.email,
    loginMethod: "local",
    role: input.role,
    status: "pending",
    mustChangePassword: false,
  });
  return rowToUser(row);
}

export class InvalidStatusTransitionError extends Error {
  constructor(action: string, currentStatus: AccountStatus) {
    super(`Cannot ${action} an account that is currently ${currentStatus}.`);
  }
}

/**
 * Applies an Administrator account-status action (approve/reject/suspend/
 * deactivate/reactivate/activate), enforcing the same state machine as the
 * MySQL-backed path in db.ts. Throws InvalidStatusTransitionError if the
 * account isn't in a state that allows the requested action.
 */
export function transitionLocalUserStatus(id: number, action: keyof typeof STATUS_TRANSITIONS): User {
  ensureSeeded();
  const row = localGetUserById(id);
  if (!row) throw new Error("User not found.");
  const transition = STATUS_TRANSITIONS[action];
  const currentStatus: AccountStatus = row.status ?? "active";
  if (!transition.from.includes(currentStatus)) {
    throw new InvalidStatusTransitionError(action, currentStatus);
  }
  localUpdateUser(id, { status: transition.to });
  const updated = localGetUserById(id);
  return rowToUser(updated ?? { ...row, status: transition.to });
}

/** @deprecated prefer transitionLocalUserStatus for validated Administrator actions. */
export function updateLocalUserStatus(
  id: number,
  status: "pending" | "active" | "inactive" | "suspended" | "rejected"
): void {
  localUpdateUser(id, { status });
}

export function updateLocalUserRole(
  id: number,
  role: User["role"]
): void {
  localUpdateUser(id, { role });
}

export function resetLocalUserPassword(id: number, password: string): boolean {
  localUpdateUser(id, { passwordHash: hashPassword(password) });
  return true;
}

export function deleteLocalUser(id: number): boolean {
  return localDeleteUser(id);
}

export function updateLocalUserProfile(
  openId: string,
  input: Partial<Pick<User, "name" | "email" | "phone" | "title" | "avatar">>
): User | null {
  ensureSeeded();
  const row = localGetUserByOpenId(openId);
  if (!row) return null;
  localUpdateUser(row.id, input);
  const updated = localGetUserByOpenId(openId);
  return updated ? rowToUser(updated) : null;
}

export function changeLocalUserPassword(
  openId: string,
  newPassword: string
): boolean {
  ensureSeeded();
  const row = localGetUserByOpenId(openId);
  if (!row) return false;
  // A successful password change also clears any forced-change flag (e.g. the
  // Administrator's mandatory first-login password change).
  localUpdateUser(row.id, { passwordHash: hashPassword(newPassword), mustChangePassword: false });
  return true;
}

export function isLocalUser(openId: string): boolean {
  return openId.startsWith(LOCAL_OPEN_ID_PREFIX);
}

// ─── Password reset OTPs ─────────────────────────────────────
//
// OTPs are single-use, expire after 7 minutes, and are stored as SHA-256 hashes.

const OTP_TTL_MS = 7 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_RESENDS = 4;

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

/** Generate a random 6-digit numeric OTP. */
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export type LocalOtpResult =
  | { ok: true; otpId: number; userId: number; maskedEmail: string; otp: string }
  | { ok: false; reason: string; remaining?: number };

/** Find a user by username or email (same lookup as login). */
function findUserByIdentifier(identifier: string): { row: Record<string, any> | undefined; userId: number } {
  const needle = identifier.trim();
  const row = localGetUserByUsername(needle) ?? (needle.includes("@") ? localGetUserByEmail(needle) : undefined);
  return { row, userId: row?.id ?? 0 };
}

/** Mask email for display: shows domain + last few chars only. */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "your registered email";
  const [local, domain] = email.split("@");
  if (local.length <= 2) return `***@${domain}`;
  return `***${local.slice(-2)}@${domain}`;
}

/** Step 1: Request an OTP (forgot password). */
export function createLocalOtp(identifier: string) {
  ensureSeeded();
  const { row } = findUserByIdentifier(identifier);
  if (!row || !isLocalUser(row.openId)) {
    return null;
  }

  // Invalidate any existing active OTP for this user
  const existing = localGetActiveOtpForUser(row.id);
  if (existing) {
    localUpdatePasswordResetOtp(existing.id, { usedAt: new Date().toISOString() });
  }

  const otp = generateOtp();
  const otpHashed = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const otpRow = localCreatePasswordResetOtp(row.id, otpHashed, expiresAt);
  const masked = maskEmail(row.email ?? "");

  return { ok: true as const, otpId: otpRow.id, userId: row.id, maskedEmail: masked, otp };
}

/** Step 2: Verify an OTP. */
export function verifyLocalOtp(otpId: number, otpInput: string): { ok: true; otpId: number; userId: number } | { ok: false; reason: string } {
  ensureSeeded();
  const row = localGetPasswordResetOtpById(otpId);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const attempts = (row.attempts ?? 0) + 1;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    localUpdatePasswordResetOtp(row.id, { usedAt: new Date().toISOString(), attempts });
    return { ok: false, reason: "too_many_attempts" };
  }

  if (hashOtp(otpInput) !== row.otpHash) {
    localUpdatePasswordResetOtp(row.id, { attempts });
    return { ok: false, reason: "invalid_otp" };
  }

  localUpdatePasswordResetOtp(row.id, { verifiedAt: new Date().toISOString(), attempts });
  return { ok: true, otpId: row.id, userId: row.userId };
}

/** Step 3: Consume a verified OTP and set new password. */
export function consumeLocalOtp(otpId: number, newPassword: string): { ok: true; userId: number } | { ok: false; reason: string } {
  ensureSeeded();
  const row = localGetPasswordResetOtpById(otpId);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (!row.verifiedAt) return { ok: false, reason: "not_verified" };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" };

  localUpdatePasswordResetOtp(row.id, { usedAt: new Date().toISOString() });
  localUpdateUser(row.userId, { passwordHash: hashPassword(newPassword), mustChangePassword: false });
  return { ok: true, userId: row.userId };
}

/** Resend OTP: invalidates old OTP, generates a new one. */
export function resendLocalOtp(otpId: number): LocalOtpResult {
  ensureSeeded();
  const row = localGetPasswordResetOtpById(otpId);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };

  const resendCount = (row.resendCount ?? 0) + 1;
  if (resendCount > MAX_RESENDS) {
    localUpdatePasswordResetOtp(row.id, { usedAt: new Date().toISOString() });
    return { ok: false, reason: "max_resends_reached" };
  }

  // Check cooldown (last created + 60s)
  const lastCreated = new Date(row.createdAt).getTime();
  if (Date.now() - lastCreated < RESEND_COOLDOWN_MS) {
    const remaining = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastCreated)) / 1000);
    return { ok: false, reason: "cooldown", remaining };
  }

  // Invalidate old OTP
  localUpdatePasswordResetOtp(row.id, { usedAt: new Date().toISOString() });

  // Generate new OTP
  const otp = generateOtp();
  const otpHashed = hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const newOtpRow = localCreatePasswordResetOtp(row.userId, otpHashed, expiresAt);
  localUpdatePasswordResetOtp(newOtpRow.id, { resendCount });

  const user = localGetUserById(row.userId);
  const masked = maskEmail(user?.email ?? "");

  return { ok: true, otpId: newOtpRow.id, userId: row.userId, maskedEmail: masked, otp };
}

export { OTP_TTL_MS, RESEND_COOLDOWN_MS, MAX_RESENDS, MAX_OTP_ATTEMPTS };
