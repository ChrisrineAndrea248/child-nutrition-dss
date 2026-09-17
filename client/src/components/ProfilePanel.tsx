import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, Check, Clock, Eye, EyeOff, KeyRound, LockKeyhole,
  Mail, Phone, Save, ShieldCheck, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  validateFullName, validateEmail, validatePhone, validateJobTitle,
  validatePassword,
} from "@shared/validation";

function initials(value: string): string {
  return value
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  nutrition_officer: "Nutrition Officer",
  data_manager: "Data Manager",
};

const AVATAR_MAX_BYTES = 1_800_000;

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 16) score++;
  if (score <= 2) return { score, label: "Weak", color: "#e53e3e" };
  if (score <= 3) return { score, label: "Fair", color: "#dd6b20" };
  if (score <= 4) return { score, label: "Good", color: "#d69e2e" };
  return { score, label: "Strong", color: "#38a169" };
}

type FieldErrors = { name: string; email: string; phone: string; title: string };

function computeErrors(profile: { name: string; email: string; phone: string; title: string }): FieldErrors {
  return {
    name: validateFullName(profile.name) ?? "",
    email: validateEmail(profile.email) ?? "",
    phone: validatePhone(profile.phone) ?? "",
    title: validateJobTitle(profile.title) ?? "",
  };
}

export default function ProfilePanel() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    title: user?.title ?? "",
    avatar: user?.avatar ?? "",
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Guarantee password fields are empty on every mount — clears any stale
  // React state left from a prior visit in the same session.
  useEffect(() => {
    setPw({ current: "", next: "", confirm: "" });
  }, []);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const strength = useMemo(() => passwordStrength(pw.next), [pw.next]);
  const errors = useMemo(() => computeErrors(profile), [profile]);

  // Show error for a field if it was touched or form was submitted, and there is an error
  const show = (field: keyof FieldErrors) => (touched[field] || submitted) && errors[field];
  const hasAnyProfileError = errors.name || errors.email || errors.phone || errors.title;

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated.");
      setSubmitted(false);
      setTouched({});
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message || "Unable to update profile."),
  });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Password changed. Use it on your next sign in.");
      setPw({ current: "", next: "", confirm: "" });
    },
    onError: (e) => toast.error(e.message || "Unable to change password."),
  });

  const handleAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(`Image must be under ${Math.round(AVATAR_MAX_BYTES / 1000)}KB before upload. Please use a smaller image.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfile((p) => ({ ...p, avatar: canvas.toDataURL("image/jpeg", 0.82) }));
        toast.success("Photo attached. Save your profile to keep it.");
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const submitProfile = () => {
    setSubmitted(true);
    const errs = computeErrors(profile);
    if (errs.name || errs.email || errs.phone || errs.title) {
      toast.error("Please fix the highlighted fields before saving.");
      return;
    }
    updateProfile.mutate({
      name: profile.name.trim(),
      email: profile.email.trim() || undefined,
      phone: profile.phone.replace(/\s/g, "").trim() || undefined,
      title: profile.title.trim() || undefined,
      avatar: profile.avatar || undefined,
    });
  };

  const submitPassword = () => {
    if (!pw.current || !pw.next) {
      toast.error("Enter your current and new password.");
      return;
    }
    const strengthError = validatePassword(pw.next);
    if (strengthError) {
      toast.error(strengthError);
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    if (pw.next === pw.current) {
      toast.error("New password must be different from your current password.");
      return;
    }
    changePassword.mutate({ currentPassword: pw.current, newPassword: pw.next, confirmPassword: pw.confirm });
  };

  /** Strip non-digit characters from phone input except leading + */
  const handlePhoneInput = (raw: string) => {
    // Allow only + at start, then digits only
    const cleaned = raw.replace(/[^+\d]/g, "");
    // Only one + allowed, and only at start
    const normalised = cleaned.replace(/\+/g, (m, offset) => offset === 0 ? m : "");
    setProfile((p) => ({ ...p, phone: normalised }));
  };

  if (!user) {
    return <section className="panel"><div className="module-state">No active session.</div></section>;
  }

  const memberSince = (user as any).createdAt
    ? new Date((user as any).createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;
  const lastSignIn = (user as any).lastSignedIn
    ? new Date((user as any).lastSignedIn).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <>
      {/* ── Profile Information ──────────────────────────────── */}
      <section className="panel">
        <div className="panel-heading">
          <div><h2>My Profile</h2><p>Manage your personal information and how you appear in the system.</p></div>
        </div>
        <div className="profile-hero">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="avatar" /> : initials(user.name ?? user.username ?? "U")}</div>
            <button type="button" className="avatar-upload" onClick={() => fileInputRef.current?.click()} title="Upload profile photo"><Camera size={15} /></button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }} />
          </div>
          <div>
            <b>{user.name ?? "User"}</b>
            <span className="role-badge officer">{ROLE_LABELS[user.role] ?? user.role}</span>
            <p className="profile-meta">@{user.username ?? user.openId} · {user.email ?? "No email on file"}</p>
            {(memberSince || lastSignIn) && (
              <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "12px", color: "#718096" }}>
                {memberSince && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><ShieldCheck size={13} /> Member since {memberSince}</span>}
                {lastSignIn && <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Clock size={13} /> Last sign-in {lastSignIn}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="form-grid">
          {/* Full name */}
          <label className={show("name") ? "field-error" : ""}>
            Full name
            <input
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="Your full name"
              className={show("name") ? "input-error" : ""}
            />
            {show("name") && <span className="field-error-text">{errors.name}</span>}
          </label>

          {/* Job title */}
          <label className={show("title") ? "field-error" : ""}>
            Job title
            <input
              value={profile.title}
              onChange={(e) => setProfile({ ...profile, title: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, title: true }))}
              placeholder="e.g. Senior Nutrition Officer"
              className={show("title") ? "input-error" : ""}
            />
            {show("title") && <span className="field-error-text">{errors.title}</span>}
          </label>

          {/* Email */}
          <label className={show("email") ? "field-error" : ""}>
            Email
            <input
              type="email"
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="name@example.com"
              className={show("email") ? "input-error" : ""}
            />
            {show("email") ? <span className="field-error-text">{errors.email}</span> : null}
          </label>

          {/* Phone */}
          <label className={show("phone") ? "field-error" : ""}>
            Phone
            <input
              type="tel"
              inputMode="tel"
              value={profile.phone}
              onChange={(e) => handlePhoneInput(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
              placeholder="+255700000000"
              className={show("phone") ? "input-error" : ""}
            />
            {show("phone") ? <span className="field-error-text">{errors.phone}</span> : (
              !touched.phone && !submitted && (
                <span style={{ fontSize: "10px", color: "#718096", marginTop: "2px", display: "block" }}>
                  Include country code, e.g. +255700000000
                </span>
              )
            )}
          </label>
        </div>
        <div className="form-footer">
          <span>Username is used to sign in and cannot be changed.</span>
          <button className="primary-btn" onClick={submitProfile} disabled={updateProfile.isPending}>
            <Save size={16} /> {updateProfile.isPending ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </section>

      {/* ── Change Password ──────────────────────────────────── */}
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Change Password</h2><p>Use a strong password you don't use anywhere else.</p></div>
        </div>
        <div className="form-grid">
          <label>
            Current password
            <div style={{ position: "relative" }}>
              <input type={showCurrent ? "text" : "password"} autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Current password" style={{ paddingRight: "34px" }} />
              <button type="button" onClick={() => setShowCurrent((v) => !v)} tabIndex={-1} style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: "4px", borderRadius: "4px", color: "#758398", cursor: "pointer" }}>
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>
          <label>
            New password
            <div style={{ position: "relative" }}>
              <input type={showNext ? "text" : "password"} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="Min 8 chars, upper, lower, number, symbol" style={{ paddingRight: "34px" }} />
              <button type="button" onClick={() => setShowNext((v) => !v)} tabIndex={-1} style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: "4px", borderRadius: "4px", color: "#758398", cursor: "pointer" }}>
                {showNext ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {pw.next.length > 0 && (
              <div style={{ marginTop: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontSize: "11px", color: "#718096" }}>Password strength</span>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: strength.color }}>{strength.label}</span>
                </div>
                <div style={{ height: "4px", background: "#e2e8f0", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(strength.score / 6) * 100}%`, background: strength.color, borderRadius: "2px", transition: "width 0.2s, background 0.2s" }} />
                </div>
              </div>
            )}
          </label>
          <label>
            Confirm new password
            <div style={{ position: "relative" }}>
              <input type={showConfirm ? "text" : "password"} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Repeat new password" style={{ paddingRight: "34px" }} />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1} style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: "4px", borderRadius: "4px", color: "#758398", cursor: "pointer" }}>
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {pw.confirm.length > 0 && pw.next === pw.confirm && (
              <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", fontSize: "11px", color: "#38a169", fontWeight: 600 }}>
                <Check size={12} /> Passwords match
              </div>
            )}
          </label>
        </div>
        <div className="form-footer">
          <span><LockKeyhole size={14} /> Passwords are stored as salted hashes only.</span>
          <button className="primary-btn" onClick={submitPassword} disabled={changePassword.isPending}>
            {changePassword.isPending ? "Updating..." : "Change Password"}
          </button>
        </div>
      </section>
    </>
  );
}
