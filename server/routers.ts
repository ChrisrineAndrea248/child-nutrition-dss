import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS, REMEMBER_ME_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, adminProcedure, publicProcedure, router, requirePermission } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { isLocalUser, verifyPassword, hashPassword } from "./_core/localUsers";
import { REGISTERABLE_ROLES, LOGIN_STATUS_MESSAGES, INVALID_CREDENTIALS_MESSAGE, validateRegistration, validatePassword, validatePasswordStrong, validateEmail, validateFullName, validateUsername, validateConfirmPassword, STATUS_TRANSITIONS, type AccountStatus, FULL_NAME_MIN, FULL_NAME_MAX, USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN, PASSWORD_MAX } from "@shared/validation";
import { hasPermission, type Role } from "@shared/permissions";
import { runPrediction, buildDssRecommendations, assessmentFromProbability, recommendationsForRisk, PREDICTOR_DEFINITIONS } from "./prediction.logic";

// ─── CAPTCHA verification (optional, env-gated) ──────────────
async function verifyCaptcha(token: string, remoteIp: string): Promise<boolean> {
  const provider = process.env.CAPTCHA_PROVIDER ?? "hcaptcha";
  const secret = process.env.CAPTCHA_SECRET_KEY;
  if (!secret) return true; // No key configured → skip verification
  try {
    const url = provider === "recaptcha"
      ? "https://www.google.com/recaptcha/api/siteverify"
      : "https://hcaptcha.com/siteverify";
    const body = new URLSearchParams({ secret, response: token, remoteip: remoteIp });
    const resp = await fetch(url, { method: "POST", body });
    const data = await resp.json() as Record<string, unknown>;
    return data.success === true;
  } catch (error) {
    console.error("[CAPTCHA] Verification failed:", error);
    return false;
  }
}
import {
  emailNewRegistrationToAdmin, emailAccountApproved, emailAccountRejected,
  emailAccountSuspended, emailAccountDeactivated, emailAccountReactivated,
  emailAccountActivated, emailOtp, emailRoleChanged, sendPasswordChangedEmail,
} from "./_core/email";
import { createAuditLog, createChild, createPrediction, createReport, deleteChild, deletePrediction, getChildByChildId, getChildWithAllData, getNextChildId, getPrediction, getSettings, getLatestModelVersion, listChildren, listPredictions, listReports, listMaternalInformation, listHouseholdInformation, listHealthEnvironmentInformation, listUsers, createManagedUser, updateUserRole, deleteUser, saveMaternalInformation, updateMaternalInformation, deleteMaternalInformation, saveHouseholdInformation, updateHouseholdInformation, deleteHouseholdInformation, saveHealthEnvironmentInformation, updateHealthEnvironmentInformation, deleteHealthEnvironmentInformation, saveSetting, updateChild, upsertUser, resetUserPassword, updateUserProfile, changeUserPassword, getUserByOpenId, getUserByEmail, getUserById, registerUser, transitionUserStatus, createOtp, verifyOtp, consumeOtp, resendOtp, maskEmail, updateUserEmail, attemptLogin, listAuditLogs, createNotification, listNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, getPasswordHistory, LocalDuplicateAccountError, InvalidStatusTransitionError, getDb } from "./db";
import { generateCSV, generateXLSX, generatePrintHTML, type ReportFilters } from "./reports";

// ─── Rate Limiting & Account Lockout ──────────────────────────
// In-memory stores — reset on server restart, acceptable for a demo/dev deployment.

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 10;

// ─── Registration / Forgot-Password rate limiting ─────────────
const AUTH_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REGISTER_PER_WINDOW = 5;
const MAX_FORGOT_PER_WINDOW = 5;
const MAX_REGISTRATIONS_PER_IP_PER_HOUR = 3;
const REGISTRATION_IP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

type AuthRateEntry = { count: number; windowStart: number };
const registerRateLimits = new Map<string, AuthRateEntry>();
const forgotRateLimits = new Map<string, AuthRateEntry>();

/** Per-key (IP or username) failed login tracking. */
type AttemptEntry = { count: number; firstAttemptAt: number; lockedUntil: number | null };
const failedAttempts = new Map<string, AttemptEntry>();

/** Per-IP rate limiting for login requests. */
type RateEntry = { count: number; windowStart: number };
const ipRateLimits = new Map<string, RateEntry>();

function cleanupOldEntries() {
  const now = Date.now();
  for (const [key, entry] of failedAttempts) {
    if (entry.lockedUntil && entry.lockedUntil < now) failedAttempts.delete(key);
    else if (!entry.lockedUntil && now - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS) failedAttempts.delete(key);
  }
  for (const [key, entry] of ipRateLimits) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipRateLimits.delete(key);
  }
  for (const [key, entry] of registerRateLimits) {
    if (now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) registerRateLimits.delete(key);
  }
  for (const [key, entry] of forgotRateLimits) {
    if (now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) forgotRateLimits.delete(key);
  }
}

function checkIpRateLimit(ip: string): boolean {
  cleanupOldEntries();
  const now = Date.now();
  const entry = ipRateLimits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRateLimits.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= MAX_ATTEMPTS_PER_WINDOW;
}

function recordFailedAttempt(key: string): { locked: boolean; remainingAttempts: number } {
  const now = Date.now();
  const entry = failedAttempts.get(key);
  if (!entry || (!entry.lockedUntil && now - entry.firstAttemptAt > RATE_LIMIT_WINDOW_MS)) {
    failedAttempts.set(key, { count: 1, firstAttemptAt: now, lockedUntil: null });
    return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - 1 };
  }
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, remainingAttempts: 0 };
  }
  entry.count++;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { locked: true, remainingAttempts: 0 };
  }
  return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - entry.count };
}

function isLockedOut(key: string): boolean {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) return true;
  return false;
}

function clearFailedAttempts(key: string) {
  failedAttempts.delete(key);
}

function checkAuthRateLimit(ip: string, store: Map<string, AuthRateEntry>, max: number): boolean {
  cleanupOldEntries();
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now - entry.windowStart > AUTH_RATE_LIMIT_WINDOW_MS) {
    store.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

/** Check if this IP has exceeded the registration cap (uses audit_logs). */
async function checkRegistrationIpCap(ip: string): Promise<boolean> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - REGISTRATION_IP_WINDOW_MS).toISOString();
  if (db) {
    const [rows] = await db.query<any[]>(
      "SELECT COUNT(*) AS cnt FROM `audit_logs` WHERE `action` = 'user.registered' AND JSON_EXTRACT(`metadata`, '$.ip') = ? AND `createdAt` >= ?",
      [ip, cutoff]
    );
    return (rows[0]?.cnt ?? 0) < MAX_REGISTRATIONS_PER_IP_PER_HOUR;
  }
  // Local fallback: check in-memory audit logs
  const logs = await listAuditLogs(500);
  const recentFromIp = logs.filter(
    (l: any) => l.action === "user.registered" && l.metadata?.ip === ip && new Date(l.createdAt).getTime() >= Date.now() - REGISTRATION_IP_WINDOW_MS
  );
  return recentFromIp.length < MAX_REGISTRATIONS_PER_IP_PER_HOUR;
}

/** Translates internal/db errors into safe, understandable messages. Never leaks SQL errors, stack traces, or connection details to the client. */
function toSafeError(error: unknown, fallback: string): TRPCError {
  if (error instanceof LocalDuplicateAccountError) {
    return new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof InvalidStatusTransitionError) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) return error;
  console.error("[Server error]", error);
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: fallback });
}

const STATUS_ACTION_SUCCESS_MESSAGE: Record<keyof typeof STATUS_TRANSITIONS, string> = {
  approve: "User approved successfully.",
  reject: "User rejected successfully.",
  suspend: "User suspended successfully.",
  deactivate: "User deactivated successfully.",
  reactivate: "User reactivated successfully.",
  activate: "User activated successfully.",
};

const STATUS_ACTION_AUDIT_LABEL: Record<keyof typeof STATUS_TRANSITIONS, string> = {
  approve: "user.approved",
  reject: "user.rejected",
  suspend: "user.suspended",
  deactivate: "user.deactivated",
  reactivate: "user.reactivated",
  activate: "user.activated",
};

const STATUS_ACTION_NOTIFICATION: Record<keyof typeof STATUS_TRANSITIONS, { title: string; message: (name: string) => string }> = {
  approve: { title: "Account Approved", message: (n) => `Congratulations ${n}! Your account has been approved. You can now sign in.` },
  reject: { title: "Account Rejected", message: (n) => `Hi ${n}, your registration has been rejected. Please contact an administrator for more information.` },
  suspend: { title: "Account Suspended", message: (n) => `Hi ${n}, your account has been suspended by an administrator. Please contact support.` },
  deactivate: { title: "Account Deactivated", message: (n) => `Hi ${n}, your account has been deactivated. Please contact an administrator to reactivate.` },
  reactivate: { title: "Account Reactivated", message: (n) => `Welcome back ${n}! Your account has been reactivated. You can now sign in.` },
  activate: { title: "Account Activated", message: (n) => `Welcome ${n}! Your account has been activated. You can now sign in.` },
};

async function runStatusAction(action: keyof typeof STATUS_TRANSITIONS, targetId: number, actingAdminId: number) {
  // ─── Self-targeting guard ──────────────────────────────────
  // Prevent admins from suspending/deactivating their own account.
  if (targetId === actingAdminId && (action === "suspend" || action === "deactivate")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot suspend or deactivate your own account." });
  }

  const users = await listUsers();
  const target = users.find((u) => u.id === targetId);

  // ─── Last active Administrator guard ───────────────────────
  // Prevent removing the last active admin — would lock everyone out.
  if ((action === "suspend" || action === "deactivate") && target?.role === "admin") {
    const otherActiveAdmins = users.filter((u) => u.role === "admin" && u.status === "active" && u.id !== targetId);
    if (otherActiveAdmins.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot deactivate the last active Administrator account — at least one active Administrator must remain." });
    }
  }

  try {
    await transitionUserStatus(targetId, action);
  } catch (error) {
    throw toSafeError(error, `Unable to ${action} this user. Please try again.`);
  }
  await createAuditLog({ userId: actingAdminId, action: STATUS_ACTION_AUDIT_LABEL[action], entity: "user", entityId: String(targetId) });

  if (target) {
    const targetName = target.name ?? target.username ?? "User";
    const targetEmail = target.email ?? "";

    // In-app notification
    const notif = STATUS_ACTION_NOTIFICATION[action];
    await sendNotification({
      userId: target.id,
      title: notif.title,
      message: notif.message(targetName),
      type: STATUS_ACTION_AUDIT_LABEL[action],
      entity: "user",
      entityId: String(targetId),
    });

    // Email notification (fire-and-forget, logged to audit)
    if (targetEmail) {
      let emailResult = false;
      switch (action) {
        case "approve":
          emailResult = await emailAccountApproved({ name: targetName, username: target.username ?? "", role: target.role, email: targetEmail });
          break;
        case "reject":
          emailResult = await emailAccountRejected({ name: targetName, email: targetEmail });
          break;
        case "suspend":
          emailResult = await emailAccountSuspended({ name: targetName, email: targetEmail });
          break;
        case "deactivate":
          emailResult = await emailAccountDeactivated({ name: targetName, email: targetEmail });
          break;
        case "reactivate":
          emailResult = await emailAccountReactivated({ name: targetName, username: target.username ?? "", email: targetEmail });
          break;
        case "activate":
          emailResult = await emailAccountActivated({ name: targetName, username: target.username ?? "", email: targetEmail, role: target.role });
          break;
      }
      await createAuditLog({
        userId: actingAdminId,
        action: emailResult ? `email.sent_${action}_user` : `email.failed_${action}_user`,
        entity: "user",
        entityId: String(targetId),
      });
    }
  }

  return { success: true as const, message: STATUS_ACTION_SUCCESS_MESSAGE[action] };
}

const micsPredictorInput = z.object({
  childId: z.string().min(1),
  CAGE: z.union([z.string(), z.number()]),
  WB4: z.union([z.string(), z.number()]),
  WAGEM: z.union([z.string(), z.number()]),
  CEB: z.union([z.string(), z.number()]),
  CSURV: z.union([z.string(), z.number()]),
  CDEAD: z.union([z.string(), z.number()]),
  CM11: z.union([z.string(), z.number()]),
  HL4: z.string().min(1),
  HH6: z.string().min(1),
  windex5: z.string().min(1),
  WS1: z.string().min(1),
  WS11: z.string().min(1),
  WS15: z.string().min(1),
  welevel: z.string().min(1),
  MSTATUS: z.string().min(1),
  CM17: z.string().min(1),
  insurance: z.string().min(1),
});

const predictionInput = z.object({
  childId: z.string().min(1),
  ageMonths: z.number().min(0).max(120),
  sex: z.string().min(1),
  maternal: z.record(z.string(), z.unknown()).optional(),
  household: z.record(z.string(), z.unknown()).optional(),
  health: z.record(z.string(), z.unknown()).optional(),
});

const toPublicUser = (user: any) => {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
};

// ─── Notification helpers ──────────────────────────────────────
// Creates notifications for specific users or all users with a given role.

async function sendNotification(opts: {
  userId?: number;
  role?: Role;
  title: string;
  message: string;
  type: string;
  entity?: string;
  entityId?: string;
  link?: string;
}) {
  try {
    if (opts.userId) {
      await createNotification({
        userId: opts.userId,
        title: opts.title,
        message: opts.message,
        type: opts.type,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        link: opts.link ?? null,
      });
      return;
    }
    if (opts.role) {
      const users = await listUsers();
      for (const u of users) {
        if (u.role === opts.role && u.status === "active") {
          await createNotification({
            userId: u.id,
            title: opts.title,
            message: opts.message,
            type: opts.type,
            entity: opts.entity ?? null,
            entityId: opts.entityId ?? null,
            link: opts.link ?? null,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[Notification] Failed to create notification:", err);
  }
}

// ─── Notifications router ──────────────────────────────────────

const notificationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
  unreadCount: protectedProcedure.query(({ ctx }) => getUnreadNotificationCount(ctx.user.id)),
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => markNotificationRead(input.id, ctx.user.id)),
  markAllRead: protectedProcedure.mutation(({ ctx }) => markAllNotificationsRead(ctx.user.id)),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => toPublicUser(opts.ctx.user)),

    register: publicProcedure
      .input(
        z.object({
          name: z.string(),
          username: z.string(),
          email: z.string(),
          password: z.string(),
          confirmPassword: z.string(),
          role: z.string(),
          captchaToken: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.ip ?? ctx.req.headers["x-forwarded-for"] ?? "unknown").toString().split(",")[0].trim();

        // CAPTCHA verification (when enabled)
        if (process.env.CAPTCHA_ENABLED === "true" && input.captchaToken) {
          const captchaValid = await verifyCaptcha(input.captchaToken, clientIp);
          if (!captchaValid) {
            await createAuditLog({ action: "security.captcha_failed", entity: "auth", entityId: input.username, metadata: { ip: clientIp } });
            throw new TRPCError({ code: "BAD_REQUEST", message: "CAPTCHA verification failed. Please try again." });
          }
        }

        // Rate limit: 5 registrations per IP per 15 minutes
        if (!checkAuthRateLimit(clientIp, registerRateLimits, MAX_REGISTER_PER_WINDOW)) {
          await createAuditLog({ action: "security.rate_limited", entity: "auth", entityId: input.username, metadata: { ip: clientIp, endpoint: "auth.register" } });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many registration attempts. Please wait a moment and try again." });
        }

        // Cap: max 3 registrations per IP per hour
        const ipCapOk = await checkRegistrationIpCap(clientIp);
        if (!ipCapOk) {
          await createAuditLog({ action: "security.registration_blocked", entity: "auth", entityId: input.username, metadata: { ip: clientIp, reason: "ip_registration_cap" } });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many accounts created from this network. Please try again later." });
        }

        const fieldErrors = validateRegistration(input);
        const firstError = Object.values(fieldErrors)[0];
        if (firstError) throw new TRPCError({ code: "BAD_REQUEST", message: firstError });

        // Extended password check: common password + identity-based rejection
        const strongErr = validatePasswordStrong(input.password, [input.username, input.email.split("@")[0], input.name.trim()]);
        if (strongErr) throw new TRPCError({ code: "BAD_REQUEST", message: strongErr });

        // Belt-and-suspenders: reject any role other than the two public roles,
        // even if a request is crafted directly against the API bypassing the form.
        if (!(REGISTERABLE_ROLES as readonly string[]).includes(input.role)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Please select a valid role." });
        }

        let created: any;
        try {
          created = await registerUser({
            username: input.username.trim(),
            password: input.password,
            email: input.email.trim(),
            name: input.name.trim(),
            role: input.role as (typeof REGISTERABLE_ROLES)[number],
          });
          await createAuditLog({ action: "user.registered", entity: "user", entityId: created?.openId ?? input.username, metadata: { role: input.role, ip: clientIp } });
        } catch (error) {
          throw toSafeError(error, "Unable to create your account. Please try again.");
        }

        await sendNotification({
          role: "admin",
          title: "New User Registration",
          message: `${input.name.trim()} (${input.username.trim()}) has registered as ${input.role.replace(/_/g, " ")} and is pending approval.`,
          type: "user.registered",
          entity: "user",
          entityId: created?.openId ?? input.username,
          link: "/users",
        });

        await emailNewRegistrationToAdmin({
          name: input.name.trim(),
          username: input.username.trim(),
          email: input.email.trim(),
          role: input.role,
        }).then((ok) => createAuditLog({
          action: ok ? "email.sent_registration_admin" : "email.failed_registration_admin",
          entity: "user",
          entityId: created?.openId ?? input.username,
        }));

        return { success: true as const, message: "Account created successfully. Your account is pending Administrator approval." };
      }),

    login: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1), rememberMe: z.boolean().optional() }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.ip ?? ctx.req.headers["x-forwarded-for"] ?? "unknown").toString().split(",")[0].trim();
        const usernameKey = input.username.trim().toLowerCase();

        // 1) Per-IP rate limiting
        if (!checkIpRateLimit(clientIp)) {
          await createAuditLog({ action: "login.rate_limited", entity: "auth", entityId: input.username, metadata: { ip: clientIp } });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many login attempts. Please wait a moment and try again." });
        }

        // 2) Per-username account lockout
        if (isLockedOut(usernameKey)) {
          await createAuditLog({ action: "login.locked_out", entity: "auth", entityId: input.username, metadata: { ip: clientIp } });
          throw new TRPCError({ code: "FORBIDDEN", message: "Too many failed attempts. This account is temporarily locked. Please try again in a few minutes." });
        }

        const result = await attemptLogin(input.username, input.password);
        if (!result.ok) {
          // 3) Record failed attempt and audit log
          const { locked, remainingAttempts } = recordFailedAttempt(usernameKey);
          await createAuditLog({ action: "login.failed", entity: "auth", entityId: input.username, metadata: { reason: result.reason, ip: clientIp, remainingAttempts, locked } });
          const message = result.reason === "invalid" ? INVALID_CREDENTIALS_MESSAGE : (LOGIN_STATUS_MESSAGES[result.reason as AccountStatus] ?? INVALID_CREDENTIALS_MESSAGE);
          throw new TRPCError({ code: "UNAUTHORIZED", message });
        }

        // 4) Successful login — clear failed attempts, create session, audit log
        clearFailedAttempts(usernameKey);
        const user = result.user;
        const remember = input.rememberMe === true;
        const sessionLifetime = remember ? REMEMBER_ME_MS : ONE_YEAR_MS;
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.username ?? "", expiresInMs: sessionLifetime });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        if (remember) {
          ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: REMEMBER_ME_MS });
        } else {
          // Session-only cookie: no maxAge means it is deleted when the browser closes.
          ctx.res.cookie(COOKIE_NAME, sessionToken, cookieOptions);
        }
        await upsertUser({ openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, role: user.role, status: user.status });
        await createAuditLog({ userId: user.id, action: "login.success", entity: "user", entityId: user.openId, metadata: { ip: clientIp } });
        return { success: true as const, user: toPublicUser(user) };
      }),

    forgotPassword: publicProcedure
      .input(z.object({ identifier: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.ip ?? ctx.req.headers["x-forwarded-for"] ?? "unknown").toString().split(",")[0].trim();

        // Rate limit: 5 forgot-password requests per IP per 15 minutes
        if (!checkAuthRateLimit(clientIp, forgotRateLimits, MAX_FORGOT_PER_WINDOW)) {
          await createAuditLog({ action: "security.rate_limited", entity: "auth", entityId: input.identifier, metadata: { ip: clientIp, endpoint: "auth.forgotPassword" } });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many password-reset requests. Please wait a moment and try again." });
        }

        let maskedHint = "your registered email";
        let otpIdResult: number | null = null;
        try {
          const result = await createOtp(input.identifier.trim());
          if (result && result.ok) {
            console.log(`[Auth] OTP requested for user #${result.userId}.`);
            maskedHint = result.maskedEmail;
            otpIdResult = result.otpId;

            // Send the OTP via email
            const user = await getUserById(result.userId);
            if (user?.email) {
              await emailOtp({
                name: user.name ?? user.username ?? "User",
                email: user.email,
                otp: result.otp,
              }).then((ok) => createAuditLog({
                userId: result.userId,
                action: ok ? "email.sent_otp" : "email.failed_otp",
                entity: "user",
                entityId: String(result.userId),
              }));
            } else {
              console.warn(`[Auth] OTP created for user #${result.userId} but no email found — email not sent.`);
            }
          }
        } catch (error) {
          console.error("[Auth] Failed to create OTP:", error);
        }

        // Always return the same message regardless of whether account exists
        return { success: true as const, message: "If an account exists for this username or email, a verification code has been sent.", maskedEmail: maskedHint, otpId: otpIdResult };
      }),

    verifyOtp: publicProcedure
      .input(z.object({ otpId: z.number(), otp: z.string().length(6) }))
      .mutation(async ({ input, ctx }) => {
        const result = await verifyOtp(input.otpId, input.otp);
        if (!result.ok) {
          if (result.reason === "too_many_attempts") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many incorrect attempts. Please request a new code." });
          }
          if (result.reason === "expired") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This verification code has expired. Please request a new one." });
          }
          if (result.reason === "used") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "This verification code has already been used. Please request a new one." });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid verification code. Please try again." });
        }
        return { success: true as const, message: "Verification code accepted.", otpId: result.otpId };
      }),

    resendOtp: publicProcedure
      .input(z.object({ otpId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const clientIp = (ctx.req.ip ?? ctx.req.headers["x-forwarded-for"] ?? "unknown").toString().split(",")[0].trim();

        // Rate limit: 5 resend requests per IP per 15 minutes
        if (!checkAuthRateLimit(clientIp, forgotRateLimits, MAX_FORGOT_PER_WINDOW)) {
          await createAuditLog({ action: "security.rate_limited", entity: "auth", metadata: { ip: clientIp, endpoint: "auth.resendOtp" } });
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many resend requests. Please wait a moment and try again." });
        }

        const result = await resendOtp(input.otpId);
        if (!result.ok) {
          if (result.reason === "max_resends_reached") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Maximum resend attempts reached. Please start over from the beginning." });
          }
          if (result.reason === "cooldown") {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Please wait ${(result as any).remaining ?? 60} seconds before resending.` });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to resend verification code. Please start over." });
        }

        // Send the new OTP via email
        const user = await getUserById(result.userId);
        if (user?.email && result.otp) {
          await emailOtp({
            name: user.name ?? user.username ?? "User",
            email: user.email,
            otp: result.otp,
          }).then((ok) => createAuditLog({
            userId: result.userId,
            action: ok ? "email.sent_otp_resend" : "email.failed_otp_resend",
            entity: "user",
            entityId: String(result.userId),
          }));
        }

        return { success: true as const, message: "A new verification code has been sent.", maskedEmail: result.maskedEmail };
      }),

    resetPassword: publicProcedure
      .input(z.object({ otpId: z.number(), newPassword: z.string(), confirmPassword: z.string() }))
      .mutation(async ({ input }) => {
        const passwordError = validatePassword(input.newPassword);
        if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: passwordError });
        const strongErr = validatePasswordStrong(input.newPassword);
        if (strongErr) throw new TRPCError({ code: "BAD_REQUEST", message: strongErr });
        if (input.newPassword !== input.confirmPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "Passwords do not match." });

        const result = await consumeOtp(input.otpId, input.newPassword);
        if (!result.ok) {
          if (result.reason === "not_verified") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Please verify your email before setting a new password." });
          }
          throw new TRPCError({ code: "BAD_REQUEST", message: "This verification code is invalid or has expired." });
        }
        await createAuditLog({ userId: result.userId, action: "password.reset_via_otp", entity: "user", entityId: String(result.userId) });
        return { success: true as const, message: "Your password has been reset successfully. You can now log in." };
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), phone: z.string().optional(), title: z.string().optional(), avatar: z.string().max(2_500_000).optional() }))
      .mutation(async ({ input, ctx }) => {
        if (input.email) {
          const existing = await getUserByEmail(input.email.trim());
          if (existing && existing.id !== ctx.user.id) {
            throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
          }
        }
        try {
          const updated = await updateUserProfile(ctx.user.openId, input);
          await createAuditLog({ userId: ctx.user.id, action: "profile.updated", entity: "user", entityId: ctx.user.openId });
          return { success: true as const, user: toPublicUser(updated ?? ctx.user) };
        } catch (error) {
          throw toSafeError(error, "Unable to update your profile. Please correct the highlighted fields.");
        }
      }),
    changePassword: protectedProcedure
      .input(z.object({ currentPassword: z.string().min(1), newPassword: z.string(), confirmPassword: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!isLocalUser(ctx.user.openId)) throw new TRPCError({ code: "FORBIDDEN", message: "Password change is only available for local accounts" });
        const current = await getUserByOpenId(ctx.user.openId);
        if (!current || !current.passwordHash || !verifyPassword(input.currentPassword, current.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
        }
        const passwordError = validatePassword(input.newPassword);
        if (passwordError) throw new TRPCError({ code: "BAD_REQUEST", message: passwordError });
        const identityFields = [current.username ?? "", current.email?.split("@")[0] ?? "", current.name ?? ""];
        const strongErr = validatePasswordStrong(input.newPassword, identityFields);
        if (strongErr) throw new TRPCError({ code: "BAD_REQUEST", message: strongErr });
        if (input.newPassword !== input.confirmPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "New passwords do not match." });
        if (input.newPassword === input.currentPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "New password must be different from your current password." });
        // Password reuse check
        const history = await getPasswordHistory(current.id);
        if (history.length > 0) {
          const newHash = hashPassword(input.newPassword);
          if (history.includes(newHash)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reuse a recent password. Please choose a different password." });
          }
        }
        await changeUserPassword(ctx.user.openId, input.newPassword);
        await createAuditLog({ userId: ctx.user.id, action: "password.changed", entity: "user", entityId: ctx.user.openId });
        if (current.email) {
          await sendPasswordChangedEmail({
            name: current.name ?? current.username ?? "User",
            email: current.email,
          }).then((ok) => createAuditLog({
            userId: ctx.user.id,
            action: ok ? "email.sent_password_changed" : "email.failed_password_changed",
            entity: "user",
            entityId: ctx.user.openId,
          }));
        }
        return { success: true as const, message: "Password changed successfully." };
      }),
  }),

  prediction: router({
    generateId: protectedProcedure.query(async () => {
      const id = await getNextChildId();
      return { childId: id };
    }),

    getPredictors: protectedProcedure.query(() => {
      return PREDICTOR_DEFINITIONS;
    }),

    lookup: protectedProcedure
      .input(z.object({ childId: z.string().min(1) }))
      .query(async ({ input }) => {
        const data = await getChildWithAllData(input.childId);
        if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Child not found" });
        return data;
      }),

    assess: protectedProcedure
      .input(micsPredictorInput)
      .mutation(async ({ input, ctx }) => {
        const { childId, ...predictors } = input;

        const predictionResult = await runPrediction(predictors as Record<string, unknown>);

        if (!predictionResult.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: predictionResult.error || predictionResult.errors?.join("; ") || "Prediction failed",
          });
        }

        const predictions = predictionResult.predictions!;
        const model_info = predictionResult.model_info!;
        const feature_importance_raw = predictionResult.feature_importance!;

        const latestModel = await getLatestModelVersion();

        // Flatten stunting + underweight feature importance into a single
        // deduplicated array. When a variable appears in both models its
        // importance values are summed so the most cross-model-reliant
        // variables surface first.
        const importanceMap = new Map<string, number>();
        for (const entry of feature_importance_raw.stunting ?? []) {
          importanceMap.set(entry.variable, (importanceMap.get(entry.variable) ?? 0) + entry.importance);
        }
        for (const entry of feature_importance_raw.underweight ?? []) {
          importanceMap.set(entry.variable, (importanceMap.get(entry.variable) ?? 0) + entry.importance);
        }
        const feature_importance = [...importanceMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([variable, importance]) => ({ variable, importance: Math.round(importance * 10000) / 10000 }));

        const stuntingAssessment = assessmentFromProbability(predictions.stunting.probability, predictions.stunting.threshold);
        const underweightAssessment = assessmentFromProbability(predictions.underweight.probability, predictions.underweight.threshold);

        const recommendations = buildDssRecommendations(predictions.stunting.positive, predictions.underweight.positive);

        const stuntingModerate = stuntingAssessment.risk === "MODERATE RISK";
        const underweightModerate = underweightAssessment.risk === "MODERATE RISK";

        let combinedRisk: string;
        if (predictions.stunting.positive || predictions.underweight.positive) {
          combinedRisk = "HIGH RISK";
        } else if (stuntingModerate || underweightModerate) {
          combinedRisk = "MODERATE RISK";
        } else {
          combinedRisk = "LOW RISK";
        }

        await upsertUser({
          openId: ctx.user.openId,
          name: ctx.user.name,
          email: ctx.user.email,
          loginMethod: ctx.user.loginMethod,
          role: ctx.user.role,
          status: ctx.user.status,
        });

        let child = await getChildByChildId(childId);
        if (!child) {
          await createChild({ childId, ageMonths: Math.round(Number(predictors.CAGE)), sex: predictors.HL4, weightKg: String(predictors.WB4) });
          child = await getChildByChildId(childId);
        }

        const predictionId = `PRD-${Date.now()}`;

        if (child) {
          await createPrediction({
            predictionId,
            childId: child.id,
            officerId: ctx.user.id,
            modelVersionId: latestModel?.id ?? null,
            inputData: input,
            prediction: combinedRisk === "HIGH RISK" ? "Elevated Risk" : combinedRisk === "MODERATE RISK" ? "Borderline Risk" : "Normal Range",
            riskLevel: combinedRisk === "HIGH RISK" ? "High" : combinedRisk === "MODERATE RISK" ? "Moderate" : "Low",
            probability: String(predictions.stunting.probability),
            riskScore: stuntingAssessment.riskScore,
            stuntingProbability: String(predictions.stunting.probability),
            stuntingThreshold: String(predictions.stunting.threshold),
            stuntingRiskScore: stuntingAssessment.riskScore,
            underweightProbability: String(predictions.underweight.probability),
            underweightThreshold: String(predictions.underweight.threshold),
            underweightRiskScore: underweightAssessment.riskScore,
            combinedRisk,
            recommendations: [...recommendations.stunting, ...recommendations.underweight, ...recommendations.general],
            featureImportance: feature_importance,
          });
        }

        await createAuditLog({
          userId: ctx.user.id,
          action: "prediction.created",
          entity: "prediction",
          entityId: childId,
          metadata: {
            predictionId,
            stunting_prob: predictions.stunting.probability,
            underweight_prob: predictions.underweight.probability,
            stunting_positive: predictions.stunting.positive,
            underweight_positive: predictions.underweight.positive,
          },
        });

        if (combinedRisk === "HIGH RISK" || combinedRisk === "MODERATE RISK") {
          await sendNotification({
            role: "admin",
            title: combinedRisk === "HIGH RISK" ? "High-Risk Prediction Created" : "Moderate-Risk Prediction Created",
            message: `A ${combinedRisk === "HIGH RISK" ? "high" : "moderate"}-risk screening (Child ${childId}) was submitted by ${ctx.user.name ?? "a nutrition officer"}. Combined risk: ${combinedRisk}.`,
            type: "prediction.high_risk",
            entity: "prediction",
            entityId: predictionId,
            link: `/prediction/results/${predictionId}`,
          });
        }

        return {
          predictionId,
          childId,
          predictions,
          model_info,
          feature_importance,
          recommendations,
          combinedRisk,
          officer: ctx.user.name ?? "Nutrition Officer",
          generatedAt: new Date(),
        };
      }),
  }),

  history: router({
    list: protectedProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(({ input }) => listPredictions(input?.search)),
    getByPredictionId: protectedProcedure
      .input(z.object({ predictionId: z.string().min(1) }))
      .query(async ({ input }) => {
        const db = await getDb();
        let record: any;
        let childRecord: any = null;
        if (db) {
          const [rows] = await db.query<any[]>(
            "SELECT p.*, c.`childId` AS `childIdStr`, c.`ageMonths`, c.`sex` FROM `predictions` p LEFT JOIN `children` c ON p.`childId` = c.`id` WHERE p.`predictionId` = ? LIMIT 1",
            [input.predictionId]
          );
          record = rows[0];
          if (record) childRecord = { childId: record.childIdStr, ageMonths: record.ageMonths, sex: record.sex };
        } else {
          record = await getPrediction(input.predictionId);
          if (record?.childId) childRecord = await getChildByChildId(String(record.childId));
        }
        if (!record) return null;
        return {
          predictionId: record.predictionId,
          childId: childRecord?.childId ?? String(record.childId),
          age: childRecord?.ageMonths ?? null,
          sex: childRecord?.sex ?? null,
          inputData: record.inputData ?? null,
          prediction: record.prediction,
          riskLevel: record.riskLevel,
          probability: record.probability,
          riskScore: record.riskScore,
          stuntingProbability: record.stuntingProbability ?? null,
          stuntingThreshold: record.stuntingThreshold ?? null,
          stuntingRiskScore: record.stuntingRiskScore ?? null,
          underweightProbability: record.underweightProbability ?? null,
          underweightThreshold: record.underweightThreshold ?? null,
          underweightRiskScore: record.underweightRiskScore ?? null,
          combinedRisk: record.combinedRisk ?? null,
          recommendations: record.recommendations ?? null,
          featureImportance: record.featureImportance ?? null,
          officerId: record.officerId,
          createdAt: record.createdAt,
        };
      }),
    view: protectedProcedure
      .input(z.object({ predictionId: z.string().min(1) }))
      .query(({ input }) => getPrediction(input.predictionId)),
    download: protectedProcedure
      .input(z.object({ predictionId: z.string().min(1) }))
      .query(async ({ input }) => {
        const prediction = await getPrediction(input.predictionId);
        return { prediction, format: "csv" as const };
      }),
    delete: adminProcedure
      .input(z.object({ predictionId: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        await deletePrediction(input.predictionId);
        await createAuditLog({ userId: ctx.user.id, action: "prediction.deleted", entity: "prediction", entityId: input.predictionId });
        return { success: true } as const;
      }),
  }),

  reports: router({
    list: protectedProcedure.query(() => listReports()),
    create: protectedProcedure
      .input(z.object({
        reportType: z.string().min(1),
        format: z.enum(["pdf", "csv", "xlsx", "print"]),
        childId: z.string().optional(),
        officerId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const filters: ReportFilters = {
          childId: input.childId,
          officerId: input.officerId,
          startDate: input.startDate,
          endDate: input.endDate,
        };

        let fileUrl: string | null = null;

        if (input.format === "csv" || input.format === "xlsx" || input.format === "print") {
          const fs = await import("node:fs/promises");
          const path = await import("node:path");
          const reportsDir = path.join(process.cwd(), "data", "reports");
          await fs.mkdir(reportsDir, { recursive: true });

          const timestamp = Date.now();
          const safeType = input.reportType.replace(/[^a-zA-Z0-9]/g, "_");
          const ext = input.format === "print" ? "html" : input.format;
          const filename = `${safeType}_${timestamp}.${ext}`;
          const filePath = path.join(reportsDir, filename);

          let content: Buffer;
          if (input.format === "csv") {
            content = await generateCSV(input.reportType, filters);
          } else if (input.format === "xlsx") {
            content = await generateXLSX(input.reportType, filters);
          } else {
            content = await generatePrintHTML(input.reportType, filters);
          }

          await fs.writeFile(filePath, content);
          fileUrl = filename;
        }

        await createReport({
          reportType: input.reportType,
          format: input.format,
          generatedBy: ctx.user.id,
          fileUrl,
        });

        return { reportType: input.reportType, format: input.format, generatedBy: ctx.user.id, createdAt: new Date(), fileUrl, status: "ready" as const };
      }),
  }),

  settings: router({
    list: protectedProcedure.query(() => getSettings()),
    save: adminProcedure
      .input(z.object({ key: z.string().min(1), value: z.string(), auditAction: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        await saveSetting(input.key, input.value, ctx.user.id);
        const action = input.auditAction || "settings.updated";
        await createAuditLog({ userId: ctx.user.id, action, entity: "system_settings", entityId: input.key, metadata: { value: input.value } });
        return { success: true } as const;
      }),
  }),

  dashboard: router({
    stats: protectedProcedure
      .input(z.object({ range: z.enum(["7", "30", "90"]).optional() }).optional())
      .query(async ({ input }) => {
        const rangeDays = input?.range === "30" ? 30 : input?.range === "90" ? 90 : 7;
        const [rows, reports, allChildren] = await Promise.all([
          listPredictions(),
          listReports(),
          listChildren(),
        ]);

        const high = rows.filter((r) => r.riskLevel === "High").length;
        const moderate = rows.filter((r) => r.riskLevel === "Moderate").length;
        const low = rows.filter((r) => r.riskLevel === "Low").length;
        const totalScore = rows.reduce((sum, row) => sum + (Number(row.riskScore) || 0), 0);

        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - rangeDays);
        const cutoffMs = cutoff.getTime();

        const rangeRows = rows.filter((r) => {
          const d = new Date(r.createdAt);
          return d.getTime() >= cutoffMs;
        });

        const activityByDate: Record<string, number> = {};
        for (const r of rangeRows) {
          const d = new Date(r.createdAt);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          activityByDate[key] = (activityByDate[key] ?? 0) + 1;
        }
        const activitySeries = Object.entries(activityByDate)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const childMap = new Map<number, any>();
        for (const c of allChildren) {
          childMap.set(c.id, c);
        }

        const highRiskPredictions = rows.filter((r) => r.riskLevel === "High");
        const priorityChildren = highRiskPredictions.slice(0, 8).map((r) => {
          const child = childMap.get(r.childId);
          return {
            predictionId: r.predictionId,
            childId: child?.childId ?? `CH-${r.childId}`,
            ageMonths: child?.ageMonths ?? null,
            sex: child?.sex ?? null,
            prediction: r.prediction,
            riskLevel: r.riskLevel,
            probability: Number(r.probability) || 0,
            riskScore: r.riskScore,
            createdAt: r.createdAt,
          };
        });

        const recentAssessments = rows.slice(0, 6).map((r) => {
          const child = childMap.get(r.childId);
          return {
            predictionId: r.predictionId,
            childId: child?.childId ?? `CH-${r.childId}`,
            ageMonths: child?.ageMonths ?? null,
            sex: child?.sex ?? null,
            prediction: r.prediction,
            riskLevel: r.riskLevel,
            probability: Number(r.probability) || 0,
            riskScore: r.riskScore,
            createdAt: r.createdAt,
          };
        });

        return {
          totalPredictions: rows.length,
          totalChildren: allChildren.length,
          highRiskCases: high,
          moderateRiskCases: moderate,
          lowRiskCases: low,
          highRiskRate: rows.length ? high / rows.length : 0,
          avgRiskScore: rows.length ? Math.round(totalScore / rows.length) : 0,
          reportsGenerated: reports.length,
          rangeDays,
          recent: rows.slice(0, 5),
          priorityChildren,
          recentAssessments,
          riskDistribution: [
            { label: "High", value: high },
            { label: "Moderate", value: moderate },
            { label: "Low", value: low },
          ],
          activitySeries,
        };
      }),
  }),

  model: router({
    metrics: protectedProcedure.query(async () => {
      const row = await getLatestModelVersion();
      if (!row) return null;
      const trained = row.lastTrainedAt as unknown;
      return {
        accuracy: Number(row.accuracy ?? 0),
        precision: Number(row.precision ?? 0),
        recall: Number(row.recall ?? 0),
        f1: Number(row.f1Score ?? 0),
        rocAuc: Number(row.rocAuc ?? 0),
        version: row.version,
        trainingSize: row.trainingDataSize ?? 0,
        testingSize: row.testingDataSize ?? 0,
        lastTrained: trained ? (trained instanceof Date ? trained.toISOString() : String(trained)) : undefined,
        riskDistribution: row.riskDistribution,
        confusionMatrix: row.confusionMatrix,
      };
    }),
  }),

  users: router({
    list: adminProcedure.query(async () => (await listUsers()).map(toPublicUser)),
    create: adminProcedure
      .input(z.object({
        username: z.string().min(USERNAME_MIN).max(USERNAME_MAX),
        password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
        confirmPassword: z.string(),
        email: z.string().email(),
        name: z.string().min(FULL_NAME_MIN).max(FULL_NAME_MAX),
        role: z.enum(["nutrition_officer", "data_manager"]),
      }))
      .mutation(async ({ input, ctx }) => {
        // Validate all fields with shared validators (belt-and-suspenders: frontend also validates)
        const nameErr = validateFullName(input.name);
        if (nameErr) throw new TRPCError({ code: "BAD_REQUEST", message: nameErr });
        const userErr = validateUsername(input.username);
        if (userErr) throw new TRPCError({ code: "BAD_REQUEST", message: userErr });
        const emailErr = validateEmail(input.email);
        if (emailErr) throw new TRPCError({ code: "BAD_REQUEST", message: emailErr });
        const pwErr = validatePassword(input.password);
        if (pwErr) throw new TRPCError({ code: "BAD_REQUEST", message: pwErr });
        const strongErr = validatePasswordStrong(input.password, [input.username, input.email.split("@")[0], input.name.trim()]);
        if (strongErr) throw new TRPCError({ code: "BAD_REQUEST", message: strongErr });
        const confirmErr = validateConfirmPassword(input.password, input.confirmPassword);
        if (confirmErr) throw new TRPCError({ code: "BAD_REQUEST", message: confirmErr });

        let createdUser: any;
        try {
          createdUser = await createManagedUser({ username: input.username.trim(), password: input.password, email: input.email.trim(), name: input.name.trim(), role: input.role });
        } catch (error) {
          throw toSafeError(error, "Unable to create this user. Please try again.");
        }
        await createAuditLog({ userId: ctx.user.id, action: "user.created", entity: "user", entityId: input.username });

        await sendNotification({
          userId: createdUser.id,
          title: "Welcome — Account Created",
          message: `An administrator has created your account. Your username is "${input.username.trim()}". You can now sign in.`,
          type: "user.created",
          entity: "user",
          entityId: String(createdUser.id),
        });

        await emailAccountActivated({
          name: input.name.trim(),
          username: input.username.trim(),
          email: input.email.trim(),
          role: input.role,
        }).then((ok) => createAuditLog({
          userId: ctx.user.id,
          action: ok ? "email.sent_account_created_user" : "email.failed_account_created_user",
          entity: "user",
          entityId: String(createdUser.id),
        }));

        return { success: true as const, message: "User created successfully." };
      }),
    updateRole: adminProcedure
      .input(z.object({ id: z.number(), role: z.enum(["admin", "nutrition_officer", "data_manager"]) }))
      .mutation(async ({ input, ctx }) => {
        // Prevent self-role-escalation: admin cannot change their own role
        if (input.id === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot change your own role." });
        // Fetch current user to check current role
        const targetUser = (await listUsers()).find((u) => u.id === input.id);
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        await updateUserRole(input.id, input.role);
        await createAuditLog({ userId: ctx.user.id, action: "user.role_changed", entity: "user", entityId: String(input.id), metadata: { from: targetUser.role, to: input.role } });
        await sendNotification({
          userId: input.id,
          title: "Role Changed",
          message: `Your role has been changed from ${targetUser.role.replace(/_/g, " ")} to ${input.role.replace(/_/g, " ")} by an administrator.`,
          type: "user.role_changed",
          entity: "user",
          entityId: String(input.id),
        });

        if (targetUser.email) {
          await emailRoleChanged({
            name: targetUser.name ?? targetUser.username ?? "User",
            email: targetUser.email,
            oldRole: targetUser.role,
            newRole: input.role,
          }).then((ok) => createAuditLog({
            userId: ctx.user.id,
            action: ok ? "email.sent_role_changed_user" : "email.failed_role_changed_user",
            entity: "user",
            entityId: String(input.id),
          }));
        }

        return { success: true as const, message: "User role updated successfully." };
      }),
    // Validated Administrator status actions. Each enforces the exact
    // from -> to state machine in shared/validation.ts (STATUS_TRANSITIONS),
    // e.g. approve only succeeds on a Pending account, suspend only on an
    // Active one — invalid transitions are rejected with a clear message.
    approve: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("approve", input.id, ctx.user.id)),
    reject: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("reject", input.id, ctx.user.id)),
    suspend: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("suspend", input.id, ctx.user.id)),
    deactivate: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("deactivate", input.id, ctx.user.id)),
    reactivate: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("reactivate", input.id, ctx.user.id)),
    activate: adminProcedure.input(z.object({ id: z.number() })).mutation(({ input, ctx }) => runStatusAction("activate", input.id, ctx.user.id)),
    resetPassword: adminProcedure
      .input(z.object({ id: z.number(), password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX) }))
      .mutation(async ({ input, ctx }) => {
        const pwErr = validatePassword(input.password);
        if (pwErr) throw new TRPCError({ code: "BAD_REQUEST", message: pwErr });
        const strongErr = validatePasswordStrong(input.password);
        if (strongErr) throw new TRPCError({ code: "BAD_REQUEST", message: strongErr });
        await resetUserPassword(input.id, input.password);
        await createAuditLog({ userId: ctx.user.id, action: "user.password_reset", entity: "user", entityId: String(input.id) });
        return { success: true as const, message: "Password reset successfully." };
      }),
    updateEmail: adminProcedure
      .input(z.object({ id: z.number(), email: z.string().email() }))
      .mutation(async ({ input, ctx }) => {
        const emailErr = validateEmail(input.email);
        if (emailErr) throw new TRPCError({ code: "BAD_REQUEST", message: emailErr });
        // Check uniqueness
        const existing = await getUserByEmail(input.email.trim());
        if (existing && existing.id !== input.id) {
          throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
        }
        await updateUserEmail(input.id, input.email.trim());
        await createAuditLog({ userId: ctx.user.id, action: "user.email_updated", entity: "user", entityId: String(input.id), metadata: { newEmail: input.email.trim() } });
        return { success: true as const, message: "Email updated successfully." };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        if (input.id === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete your own account." });

        // Last active Administrator guard — prevent admin lockout
        const targetUser = (await listUsers()).find((u) => u.id === input.id);
        if (targetUser?.role === "admin") {
          const otherActiveAdmins = (await listUsers()).filter((u) => u.role === "admin" && u.status === "active" && u.id !== input.id);
          if (otherActiveAdmins.length === 0) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete the last active Administrator account — at least one active Administrator must remain." });
          }
        }

        await deleteUser(input.id);
        await createAuditLog({ userId: ctx.user.id, action: "user.deleted", entity: "user", entityId: String(input.id) });
        return { success: true as const, message: "User deleted successfully." };
      }),
  }),

  audit: router({
    list: requirePermission("audit.view").query(() => listAuditLogs()),
  }),

  data: router({
    children: protectedProcedure.query(() => listChildren()),
    predictions: protectedProcedure.query(() => listPredictions()),
    maternal: protectedProcedure.query(() => listMaternalInformation()),
    saveMaternal: protectedProcedure
      .input(z.object({ childId: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => saveMaternalInformation(input)),
    updateMaternal: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => updateMaternalInformation(input.id, input.data)),
    deleteMaternal: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteMaternalInformation(input.id)),
    household: protectedProcedure.query(() => listHouseholdInformation()),
    saveHousehold: protectedProcedure
      .input(z.object({ childId: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => saveHouseholdInformation(input)),
    updateHousehold: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => updateHouseholdInformation(input.id, input.data)),
    deleteHousehold: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteHouseholdInformation(input.id)),
    healthEnvironment: protectedProcedure.query(() => listHealthEnvironmentInformation()),
    saveHealthEnvironment: protectedProcedure
      .input(z.object({ childId: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => saveHealthEnvironmentInformation(input)),
    updateHealthEnvironment: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => updateHealthEnvironmentInformation(input.id, input.data)),
    deleteHealthEnvironment: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteHealthEnvironmentInformation(input.id)),
    createChild: protectedProcedure
      .input(z.object({ childId: z.string().min(1), ageMonths: z.number(), sex: z.string(), weightKg: z.number(), heightCm: z.number(), muacCm: z.number().optional() }))
      .mutation(async ({ input }) => {
        // Prevent duplicate childId — if it already exists, regenerate
        const existing = await getChildByChildId(input.childId);
        let finalChildId = input.childId;
        if (existing) {
          finalChildId = await getNextChildId();
        }
        return createChild({ ...input, childId: finalChildId, weightKg: String(input.weightKg), heightCm: String(input.heightCm), muacCm: input.muacCm ? String(input.muacCm) : undefined });
      }),
    updateChild: protectedProcedure
      .input(z.object({ id: z.string(), data: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => updateChild(input.id, input.data)),
    deleteChild: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        await deleteChild(input.id);
        await createAuditLog({ userId: ctx.user.id, action: "child.deleted", entity: "child", entityId: String(input.id) });
        await sendNotification({
          role: "admin",
          title: "Child Record Deleted",
          message: `A child record (ID: ${input.id}) was deleted by ${ctx.user.name ?? "a user"}.`,
          type: "child.deleted",
          entity: "child",
          entityId: String(input.id),
        });
        return { success: true } as const;
      }),
  }),
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
