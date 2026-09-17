// =============================================================================
// Email service — sends transactional emails via SMTP (Gmail).
//
// Every public function in this module is fire-and-forget: it never throws.
// If the SMTP transport is not configured or an email fails to send, the
// error is logged and the caller's operation continues unaffected.
//
// Required environment variables:
//   SMTP_HOST  (default: smtp.gmail.com)
//   SMTP_PORT  (default: 587)
//   SMTP_USER  — Gmail address used to send mail
//   SMTP_PASS  — Gmail App Password (NOT the account password)
//   ADMIN_EMAIL — administrator address for registration alerts
//   EMAIL_FROM  — "From" header shown to recipients
//   APP_URL     — base URL for links in emails
// =============================================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { ENV } from "./env";

// ─── Transport ─────────────────────────────────────────────────

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (_transporter) return _transporter;

  if (!ENV.smtpUser || !ENV.smtpPass) {
    console.warn("[Email] SMTP credentials not configured (SMTP_USER / SMTP_PASS). Emails will be logged to console.");
    return null;
  }
  console.log(`[Email] Creating SMTP transport — host=${ENV.smtpHost} port=${ENV.smtpPort} secure=${ENV.smtpPort === 465} user=${ENV.smtpUser}`);
  try {
    _transporter = nodemailer.createTransport({
      host: ENV.smtpHost,
      port: ENV.smtpPort,
      secure: ENV.smtpPort === 465,
      auth: { user: ENV.smtpUser, pass: ENV.smtpPass },
      tls: { rejectUnauthorized: false },
    });
    return _transporter;
  } catch (err) {
    console.error("[Email] Failed to create SMTP transport:", err);
    return null;
  }
}

// ─── Shared HTML layout ────────────────────────────────────────

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
  <tr><td style="background:#062b4d;padding:20px 28px;">
    <h1 style="margin:0;color:#ffffff;font-size:17px;font-family:Arial,sans-serif;">Child Undernutrition DSS</h1>
    <p style="margin:4px 0 0;color:#92a9c1;font-size:12px;">Decision Support System</p>
  </td></tr>
  <tr><td style="padding:28px;">
    <h2 style="margin:0 0 14px;color:#132238;font-size:16px;font-family:Arial,sans-serif;">${title}</h2>
    ${bodyHtml}
  </td></tr>
  <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;">
    <p style="margin:0;color:#718096;font-size:11px;line-height:1.5;">
      This is an automated message from the Child Undernutrition Decision Support System.<br>
      Do not reply to this email.
    </p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function plainHeader(title: string): string {
  return `${title}\n${"=".repeat(title.length)}\n\n`;
}

// ─── Send helper ───────────────────────────────────────────────

async function send(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    // Log to console when SMTP is not configured
    console.log("─".repeat(60));
    console.log(`[Email] EMAIL LOGGED (SMTP not configured)`);
    console.log(`  To:      ${opts.to}`);
    console.log(`  Subject: ${opts.subject}`);
    console.log(`  Body:\n${opts.text}`);
    console.log("─".repeat(60));
    return false;
  }
  try {
    const info = await transport.sendMail({
      from: ENV.emailFrom,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`[Email] Sent "${opts.subject}" to ${opts.to} — messageId=${info.messageId}`);
    return true;
  } catch (err: any) {
    console.error(`[Email] FAILED to send "${opts.subject}" to ${opts.to}:`);
    console.error(`  Error type: ${err?.code ?? err?.name ?? "unknown"}`);
    console.error(`  Error message: ${err?.message ?? String(err)}`);
    if (err?.response) console.error(`  SMTP response: ${err.response}`);
    return false;
  }
}

// ─── Template: Registration → Administrator ────────────────────

export async function emailNewRegistrationToAdmin(user: {
  name: string;
  username: string;
  email: string;
  role: string;
}): Promise<boolean> {
  const roleLabel = user.role.replace(/_/g, " ");
  const subject = "New User Account Registration — Approval Required";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      A new user has registered for the Child Undernutrition DSS and requires approval before they can sign in.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;width:130px;">Full Name</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.name}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Username</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.username}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Email</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.email}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Requested Role</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;text-transform:capitalize;">${roleLabel}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Status</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#f59b18;font-weight:600;">Pending Approval</td></tr>
    </table>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 8px;">
      Please review this registration request in the <strong>Users</strong> panel of the administration dashboard and approve or reject the account.
    </p>
    <p style="color:#718096;font-size:12px;margin:0;">
      Registration requests that are not reviewed within 7 days may be automatically dismissed.
    </p>
  `);
  const text = `${plainHeader(subject)}A new user has registered for the Child Undernutrition DSS and requires approval.

  Full Name:      ${user.name}
  Username:       ${user.username}
  Email:          ${user.email}
  Requested Role: ${roleLabel}
  Status:         Pending Approval

Please review this registration request in the Users panel of the administration dashboard.

-- Child Undernutrition DSS`;

  return send({ to: ENV.adminEmail, subject, html, text });
}

// ─── Template: Approval → User ─────────────────────────────────

export async function emailAccountApproved(user: {
  name: string;
  username: string;
  role: string;
  email: string;
}): Promise<boolean> {
  const roleLabel = user.role.replace(/_/g, " ");
  const subject = "Child Undernutrition DSS — Account Approved";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      We are pleased to inform you that your account registration for the Child Undernutrition Decision Support System has been reviewed and approved.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;width:130px;">Full Name</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.name}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Username</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.username}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Role</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;text-transform:capitalize;">${roleLabel}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Account Status</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#209b4a;font-weight:600;">Active</td></tr>
    </table>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 8px;">
      You may now sign in using your registered username and password.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your account registration for the Child Undernutrition Decision Support System has been approved.

  Full Name: ${user.name}
  Username:  ${user.username}
  Role:      ${roleLabel}
  Status:    Active

You may now sign in using your registered username and password.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Rejection → User ────────────────────────────────

export async function emailAccountRejected(user: {
  name: string;
  email: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Registration Not Approved";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      After review, your registration for the Child Undernutrition Decision Support System has not been approved at this time.
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      If you believe this was made in error, please contact your system administrator.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

After review, your registration for the Child Undernutrition Decision Support System has not been approved at this time.

If you believe this was made in error, please contact your system administrator.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Suspension → User ───────────────────────────────

export async function emailAccountSuspended(user: {
  name: string;
  email: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Account Suspended";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your account on the Child Undernutrition Decision Support System has been suspended by an administrator.
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      You will not be able to sign in until your account is reactivated. Please contact your system administrator for further assistance.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your account on the Child Undernutrition Decision Support System has been suspended by an administrator.

You will not be able to sign in until your account is reactivated. Please contact your system administrator for further assistance.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Deactivation → User ─────────────────────────────

export async function emailAccountDeactivated(user: {
  name: string;
  email: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Account Deactivated";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your account on the Child Undernutrition Decision Support System has been deactivated by an administrator.
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      You will not be able to sign in until your account is reactivated. Please contact your system administrator for further assistance.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your account on the Child Undernutrition Decision Support System has been deactivated by an administrator.

You will not be able to sign in until your account is reactivated. Please contact your system administrator for further assistance.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Reactivation → User ─────────────────────────────

export async function emailAccountReactivated(user: {
  name: string;
  username: string;
  email: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Account Reactivated";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your account on the Child Undernutrition Decision Support System has been reactivated. You may now sign in using your registered credentials.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;width:130px;">Username</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.username}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Account Status</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#209b4a;font-weight:600;">Active</td></tr>
    </table>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your account on the Child Undernutrition Decision Support System has been reactivated. You may now sign in using your registered credentials.

  Username: ${user.username}

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Activation (admin-created) → User ───────────────

export async function emailAccountActivated(user: {
  name: string;
  username: string;
  email: string;
  role: string;
}): Promise<boolean> {
  const roleLabel = user.role.replace(/_/g, " ");
  const subject = "Child Undernutrition DSS — Account Created";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      An administrator has created your account for the Child Undernutrition Decision Support System. Your account is active and ready for use.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;width:130px;">Full Name</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.name}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Username</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;">${user.username}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Role</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;text-transform:capitalize;">${roleLabel}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">Account Status</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#209b4a;font-weight:600;">Active</td></tr>
    </table>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 8px;">
      Please sign in using the credentials provided to you by your administrator.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

An administrator has created your account for the Child Undernutrition Decision Support System. Your account is active and ready for use.

  Full Name: ${user.name}
  Username:  ${user.username}
  Role:      ${roleLabel}
  Status:    Active

Please sign in using the credentials provided to you by your administrator.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: OTP Verification Code → User ────────────────────

export async function emailOtp(user: {
  name: string;
  email: string;
  otp: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Your Verification Code";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your verification code for resetting your password is:
    </p>
    <p style="text-align:center;margin:0 0 18px;">
      <span style="display:inline-block;background:#f0f4f8;border:2px dashed #1265d8;border-radius:8px;padding:14px 32px;font-size:28px;font-weight:700;letter-spacing:6px;color:#132238;font-family:monospace;">${user.otp}</span>
    </p>
    <p style="color:#718096;font-size:12px;line-height:1.5;margin:0 0 12px;">
      This code will expire in 7 minutes. If you did not request a password reset, you can safely ignore this message.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your verification code for resetting your password is:

  ${user.otp}

This code will expire in 7 minutes. If you did not request a password reset, you can safely ignore this message.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Password Changed → User ────────────────────────

export async function sendPasswordChangedEmail(user: {
  name: string;
  email: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Password Changed";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your password on the Child Undernutrition Decision Support System has been changed successfully.
    </p>
    <p style="color:#718096;font-size:12px;line-height:1.5;margin:0 0 12px;">
      If you did not make this change, please contact your system administrator immediately.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your password on the Child Undernutrition Decision Support System has been changed successfully.

If you did not make this change, please contact your system administrator immediately.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}

// ─── Template: Role Change → User ──────────────────────────────

export async function emailRoleChanged(user: {
  name: string;
  email: string;
  oldRole: string;
  newRole: string;
}): Promise<boolean> {
  const subject = "Child Undernutrition DSS — Role Changed";
  const html = wrapHtml(subject, `
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Dear ${user.name},
    </p>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 16px;">
      Your role on the Child Undernutrition Decision Support System has been changed by an administrator.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 18px;">
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;width:130px;">Previous Role</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;text-transform:capitalize;">${user.oldRole.replace(/_/g, " ")}</td></tr>
      <tr><td style="padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#718096;">New Role</td>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#132238;text-transform:capitalize;">${user.newRole.replace(/_/g, " ")}</td></tr>
    </table>
    <p style="color:#334155;font-size:13px;line-height:1.6;margin:0 0 8px;">
      Your permissions have been updated accordingly.
    </p>
  `);
  const text = `${plainHeader(subject)}Dear ${user.name},

Your role on the Child Undernutrition Decision Support System has been changed by an administrator.

  Previous Role: ${user.oldRole.replace(/_/g, " ")}
  New Role:      ${user.newRole.replace(/_/g, " ")}

Your permissions have been updated accordingly.

-- Child Undernutrition DSS`;

  return send({ to: user.email, subject, html, text });
}
