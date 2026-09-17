// =============================================================================
// Shared user-management validation
//
// Single source of truth for registration/account rules, used by both the
// React forms (immediate feedback) and the tRPC backend (source of truth —
// never trust the frontend alone). Keep messages here so client and server
// text never drift apart.
// =============================================================================

export const FULL_NAME_MIN = 2;
export const FULL_NAME_MAX = 100;
// Letters (incl. accented), spaces, apostrophes and hyphens only.
export const FULL_NAME_REGEX = /^[\p{L}][\p{L}\s'-]*$/u;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
// At least one lowercase, one uppercase, one digit, one special character.
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export const EMAIL_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{3,}$/;

// ─── Phone validation (E.164: +<country><number>, 8-15 digits total) ───
// Allows +255700000000, +14155552671, +447911123456 etc.
// Strips spaces, dashes, parentheses before checking.
export const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export const JOB_TITLE_MIN = 2;
export const JOB_TITLE_MAX = 128;

/** Roles selectable on the public registration form. Administrator is deliberately excluded. */
export const REGISTERABLE_ROLES = ["nutrition_officer", "data_manager"] as const;
export type RegisterableRole = (typeof REGISTERABLE_ROLES)[number];

export type AccountStatus = "pending" | "active" | "inactive" | "suspended" | "rejected";

export const STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  rejected: "Rejected",
};

/** Login-time message shown for each non-active account status. Deliberately generic for unknown credentials (see validateLoginCredentials). */
export const LOGIN_STATUS_MESSAGES: Partial<Record<AccountStatus, string>> = {
  pending: "Your account is pending Administrator approval.",
  rejected: "Your account registration was not approved.",
  suspended: "Your account has been suspended. Please contact the Administrator.",
  inactive: "Your account is currently inactive. Please contact the Administrator.",
};

export const INVALID_CREDENTIALS_MESSAGE = "Invalid username/email or password.";

function trimmed(value: string | undefined | null): string {
  return (value ?? "").trim();
}

export function validateFullName(name: string | undefined | null): string | null {
  const value = trimmed(name);
  if (!value) return "Please enter your full name.";
  if (value.length < FULL_NAME_MIN) return `Full name must be at least ${FULL_NAME_MIN} characters.`;
  if (value.length > FULL_NAME_MAX) return `Full name must be under ${FULL_NAME_MAX} characters.`;
  if (!FULL_NAME_REGEX.test(value)) return "Full name contains invalid characters.";
  return null;
}

export function validateUsername(username: string | undefined | null): string | null {
  const value = trimmed(username);
  if (!value) return "Please enter a username.";
  if (value.length < USERNAME_MIN || value.length > USERNAME_MAX)
    return `Username must be between ${USERNAME_MIN} and ${USERNAME_MAX} characters.`;
  if (!USERNAME_REGEX.test(value))
    return "Username can only contain letters, numbers, dots, underscores, and hyphens.";
  return null;
}

export function validateEmail(email: string | undefined | null): string | null {
  const value = trimmed(email);
  if (!value) return "Please enter your email address.";
  if (value.length > 320) return "Email address is too long.";
  if (value.includes(" ")) return "Email address must not contain spaces.";
  if (!value.includes("@")) return "Email address must contain an @ symbol.";
  const [local, ...domainParts] = value.split("@");
  const domain = domainParts.join("@");
  if (!domain) return "Email address must have a domain after the @ symbol.";
  if (!domain.includes(".")) return "Email address must have a valid domain (e.g. example.com).";
  const labels = domain.split(".");
  if (labels.length < 2) return "Email address must have a valid domain (e.g. example.com).";
  const tld = labels[labels.length - 1] ?? "";
  if (tld.length < 3) return "Please enter a valid email address (e.g. jane@example.com).";
  if (!/^[a-zA-Z]+$/.test(tld)) return "Please enter a valid email address (e.g. jane@example.com).";
  if (!EMAIL_REGEX.test(value)) return "Please enter a valid email address (e.g. jane@example.com).";
  return null;
}

/** Validates a phone number in E.164 format: +<country code><number> (no spaces, dashes, or parentheses). */
export function validatePhone(phone: string | undefined | null): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null; // phone is optional
  // Strip common formatting characters
  const stripped = raw.replace(/[\s\-().]/g, "");
  if (!stripped.startsWith("+")) return "Phone number must start with + followed by the country code (e.g. +255700000000).";
  if (!PHONE_REGEX.test(stripped)) return "Enter a valid phone number with country code, e.g. +255700000000. Digits only after +, no spaces or dashes.";
  return null;
}

/** Validates job title — optional, but if provided must be 2-128 chars, letters/spaces/&/. only. */
export function validateJobTitle(title: string | undefined | null): string | null {
  const raw = (title ?? "").trim();
  if (!raw) return null; // optional
  if (raw.length < JOB_TITLE_MIN) return `Job title must be at least ${JOB_TITLE_MIN} characters.`;
  if (raw.length > JOB_TITLE_MAX) return `Job title must be under ${JOB_TITLE_MAX} characters.`;
  if (!/^[\p{L}\s.&'-]+$/u.test(raw)) return "Job title can only contain letters, spaces, ampersands, periods, and hyphens.";
  return null;
}

// ─── Common password blocklist (top ~50 most-used passwords) ────

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123",
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "qwerty", "qwerty123", "abc123", "abcdef", "abc1234",
  "letmein", "welcome", "welcome1", "admin", "admin123",
  "master", "monkey", "dragon", "login", "princess",
  "football", "shadow", "sunshine", "trustno1", "iloveyou",
  "batman", "access", "hello", "charlie", "donald",
  "password1!", "p@ssword", "p@ssw0rd", "passw0rd",
  "changeme", "temp", "temporary", "test", "test123",
  "summer", "winter", "spring", "fall",
  "company", "secret", "secret123",
]);

/** Basic password strength — does NOT check identity or common-password rules. */
export function validatePassword(password: string | undefined | null): string | null {
  const value = password ?? "";
  if (!value) return "Please enter a password.";
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX || !PASSWORD_REGEX.test(value)) {
    return "Password must contain at least 8 characters, including uppercase, lowercase, number, and special character.";
  }
  return null;
}

/**
 * Extended password validation — checks basic rules, common-password blocklist,
 * and identity-based patterns. Returns the first error found, or null if valid.
 *
 * @param identityFields  Strings to reject if the password contains them (case-insensitive).
 *                         Typically [username, emailLocalPart, displayName].
 * @param previousHashes  Optional array of previous password hashes to reject reuse against.
 *                         Each entry is the hex-encoded hash string.
 */
export function validatePasswordStrong(
  password: string | undefined | null,
  identityFields?: string[],
  previousHashes?: string[],
): string | null {
  const basicErr = validatePassword(password);
  if (basicErr) return basicErr;

  const value = password!.toLowerCase();

  // Common password check
  if (COMMON_PASSWORDS.has(value)) {
    return "This password is too common. Please choose a less predictable password.";
  }

  // Identity-based check
  if (identityFields) {
    for (const field of identityFields) {
      const norm = field.toLowerCase().trim();
      if (norm.length >= 3 && value.includes(norm)) {
        return "Password must not contain your name, username, or email address.";
      }
    }
  }

  return null;
}

/**
 * Checks whether a new password hash matches any of the previous hashes.
 * Accepts raw hex strings — both `previousHashes` and `newHash` are expected
 * to be hex-encoded bcrypt/scrypt hashes.
 */
export function isPasswordReused(newHash: string, previousHashes: string[]): boolean {
  return previousHashes.some((h) => h.toLowerCase() === newHash.toLowerCase());
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return "Please confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export function validateRegisterableRole(role: string | undefined | null): string | null {
  if (!role || !(REGISTERABLE_ROLES as readonly string[]).includes(role)) return "Please select a valid role.";
  return null;
}

export type RegistrationInput = {
  name: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: string;
};

/** Validates every field of the registration form. Returns a field->message map; empty object means valid. */
export function validateRegistration(input: RegistrationInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = validateFullName(input.name);
  if (name) errors.name = name;
  const username = validateUsername(input.username);
  if (username) errors.username = username;
  const email = validateEmail(input.email);
  if (email) errors.email = email;
  const password = validatePassword(input.password);
  if (password) errors.password = password;
  else {
    const confirm = validateConfirmPassword(input.password, input.confirmPassword);
    if (confirm) errors.confirmPassword = confirm;
  }
  const role = validateRegisterableRole(input.role);
  if (role) errors.role = role;
  return errors;
}

/** Allowed account-status transitions for Administrator actions. Keyed by action name. */
export const STATUS_TRANSITIONS: Record<string, { from: AccountStatus[]; to: AccountStatus }> = {
  approve: { from: ["pending"], to: "active" },
  reject: { from: ["pending"], to: "rejected" },
  suspend: { from: ["active"], to: "suspended" },
  deactivate: { from: ["active"], to: "inactive" },
  reactivate: { from: ["inactive", "suspended"], to: "active" },
  activate: { from: ["inactive"], to: "active" },
};

export function describeInvalidTransition(action: string, currentStatus: AccountStatus): string {
  const labels = STATUS_LABELS[currentStatus] ?? currentStatus;
  switch (action) {
    case "approve":
      return `This account is ${labels}, not Pending, so it cannot be approved.`;
    case "reject":
      return `This account is ${labels}, not Pending, so it cannot be rejected.`;
    case "suspend":
      return `This account is ${labels}, not Active, so it cannot be suspended.`;
    case "deactivate":
      return `This account is ${labels}, not Active, so it cannot be deactivated.`;
    case "reactivate":
      return `This account is ${labels}, not Inactive or Suspended, so it cannot be reactivated.`;
    case "activate":
      return `This account is ${labels}, not Inactive, so it cannot be activated.`;
    default:
      return `This account's current status (${labels}) does not allow this action.`;
  }
}
