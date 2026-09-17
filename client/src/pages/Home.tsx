import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { BarChart3, Bell, Check, ChevronRight, Download, Eye, EyeOff, FileText, Gauge, HeartPulse, LockKeyhole, Mail, Menu, Search, Settings, ShieldCheck, UserRound, Users, X, AlertTriangle, Database, LogOut } from "lucide-react";
import { getVisibleNavItems, hasPermission, type Role } from "@shared/permissions";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import ConfirmDialog from "../components/ConfirmDialog";
import UsersPanel from "../components/UsersPanel";
import ProfilePanel from "../components/ProfilePanel";
import DataManagement from "../components/DataManagement";
import ReportsModule from "../components/ReportsModule";
import ModelPerformance from "../components/ModelPerformance";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { validateFullName, validateUsername, validateEmail, validatePassword, validatePasswordStrong, validateConfirmPassword, REGISTERABLE_ROLES } from "@shared/validation";

type PredictionOutcome = {
  probability: number;
  threshold: number;
  positive: boolean;
  classification: string;
  interpretation: string;
};

type DssResult = {
  childId: string;
  predictions: { stunting: PredictionOutcome; underweight: PredictionOutcome };
  model_info: { data_source: string; country: string; algorithm: string; outcomes: string[]; purpose: string; stunting_threshold: number; underweight_threshold: number };
  feature_importance: { stunting: Array<{ variable: string; importance: number }>; underweight: Array<{ variable: string; importance: number }> };
  recommendations: { stunting: string[]; underweight: string[]; general: string[] };
  combinedRisk: string;
  officer: string;
  generatedAt: Date | string;
};

type Result = { predictionId: string; childId: string; age: string; sex: string; probability: number; riskScore: number; risk: string; prediction: string; dssResult?: DssResult };

const sampleRows = [
  { id: "PRD-0789", childId: "CH-2024-00785", date: "28 May 2025", level: "High", prediction: "Moderate/Severe", probability: "0.87", officer: "Nutrition Officer" },
  { id: "PRD-0788", childId: "CH-2024-00784", date: "27 May 2025", level: "Moderate", prediction: "At Risk", probability: "0.63", officer: "Nutrition Officer" },
  { id: "PRD-0787", childId: "CH-2024-00783", date: "27 May 2025", level: "Low", prediction: "Normal", probability: "0.24", officer: "Nutrition Officer" },
  { id: "PRD-0786", childId: "CH-2024-00782", date: "27 May 2025", level: "Low", prediction: "Normal", probability: "0.19", officer: "Nutrition Officer" },
];

type Notification = {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  entity: string | null;
  entityId: string | null;
  link: string | null;
  read: boolean;
  createdAt: string | Date;
};

function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [loc, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: unreadCount = 0 } = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30000 });
  const { data: notifications = [] } = trpc.notifications.list.useQuery(undefined, { refetchInterval: 30000 });
  const markRead = trpc.notifications.markRead.useMutation({ onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); } });
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { utils.notifications.unreadCount.invalidate(); utils.notifications.list.invalidate(); } });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleClick = (n: Notification) => {
    if (!n.read) markRead.mutate({ id: n.id });
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="notif-bell-btn" onClick={() => setOpen((o) => !o)} aria-label={t("common.notifications")}>
        <Bell size={18} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-head">
            <b>{t("common.notifications")}</b>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={() => markAllRead.mutate()}>{t("common.markAllRead")}</button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 && <div className="notif-empty">{t("common.noNotifications")}</div>}
            {(notifications as Notification[]).slice(0, 20).map((n) => (
              <button key={n.id} className={`notif-item${n.read ? "" : " unread"}`} onClick={() => handleClick(n)}>
                <div className="notif-item-dot-wrap">
                  {!n.read && <span className="notif-dot" />}
                </div>
                <div className="notif-item-body">
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-msg">{n.message}</div>
                  <div className="notif-item-time">{timeAgo(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Shell({ children, title, subtitle, onLogout }: { children: React.ReactNode; title: string; subtitle?: string; onLogout?: () => void }) {
  const { t } = useTranslation();
  const [loc, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const role = (user?.role as Role) ?? "nutrition_officer";
  const visibleNavItems = getVisibleNavItems(role);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      onLogout?.();
    },
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const initials = (v?: string | null) =>
    (v || "U")
      .split(/[\s.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  const goSettings = () => {
    setProfileOpen(false);
    setOpen(false);
    navigate("/settings");
  };
  const goProfile = () => {
    setProfileOpen(false);
    setOpen(false);
    navigate("/profile");
  };
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark">
            <HeartPulse size={22} />
          </div>
          <div>
            <b>NUTRITION</b>
            <span>DSS</span>
          </div>
          <button className="close-nav" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="nav-label">{t("common.mainMenu")}</div>
        <nav>
          {visibleNavItems.map((item) => (
            <Link key={item.path} href={item.path} className={loc === item.path ? "nav-item active" : "nav-item"} onClick={() => setOpen(false)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{t(`nav.${item.label}`, { defaultValue: item.label })}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item logout" onClick={() => { setOpen(false); onLogout?.(); }}>
            <LogOut size={17} />
            <span>{t("common.logout")}</span>
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            <NotificationBell />
            <div className="profile-menu" ref={menuRef}>
              <button className="profile-trigger" onClick={() => setProfileOpen((o) => !o)}>
                <span className="welcome">{t("common.welcome", { name: user?.name?.split(" ")[0] ?? t("common.user") })}</span>
                <div className="avatar">
                  {user?.avatar ? <img src={user.avatar} alt="avatar" /> : initials(user?.name)}
                </div>
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-head">
                    <div className="avatar lg">
                      {user?.avatar ? <img src={user.avatar} alt="avatar" /> : initials(user?.name)}
                    </div>
                    <div>
                      <b>{user?.name ?? t("common.user")}</b>
                      <span>{(user?.title || user?.role || "").replace(/_/g, " ")}</span>
                    </div>
                  </div>
                  <button className="dropdown-item" onClick={goProfile}>
                    <UserRound size={15} /> {t("common.myProfile")}
                  </button>
                  {hasPermission(role, "settings.view") && (
                    <button className="dropdown-item" onClick={goSettings}>
                      <Settings size={15} /> {t("common.systemSettings")}
                    </button>
                  )}
                  <div className="dropdown-sep" />
                  <button className="dropdown-item dropdown-logout" onClick={() => { setProfileOpen(false); setOpen(false); onLogout?.(); }}>
                    <LogOut size={15} /> {t("common.logout")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}

function StatCard({ icon, color, value, label, detail }: { icon: React.ReactNode; color: string; value: string; label: string; detail: string }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color }}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <b>{label}</b>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  return <span className={`risk-badge ${level.toLowerCase()}`}>{level}</span>;
}

function Table({ rows = sampleRows }: { rows?: typeof sampleRows }) {
  const [, navigate] = useLocation();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Child ID</th>
            <th>Date</th>
            <th>Risk Level</th>
            <th>Prediction</th>
            <th>Probability</th>
            <th>Officer</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td>{r.childId}</td>
              <td>{r.date}</td>
              <td><RiskBadge level={r.level} /></td>
              <td>{r.prediction}</td>
              <td className="mono">{r.probability}</td>
              <td>{r.officer}</td>
              <td><button className="table-action" onClick={() => navigate(`/prediction/results/${r.id}`)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = { nutrition_officer: "Nutrition Officer", data_manager: "Data Manager" };

type AuthMode = "signin" | "register" | "forgot";

function LoginHero() {
  const { t } = useTranslation();
  return (
    <section className="login-visual">
      <img src="/measure.jpeg" alt="MUAC Measurement" className="login-hero-img" />
      <div className="visual-content">
        <div className="visual-logo"><HeartPulse size={38} /></div>
        <span className="visual-label">{t("auth.loginTitle")}</span>
        <h1>{t("auth.loginDescription")}</h1>
      </div>
    </section>
  );
}

function SignInForm({ onSwitch }: { onSwitch: (mode: AuthMode) => void }) {
  const { t } = useTranslation();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const utils = trpc.useUtils();
  const login = trpc.auth.login.useMutation({
    onSuccess: async () => { setLoginError(""); await utils.auth.me.invalidate(); },
    onError: (e) => setLoginError(e.message || t("auth.loginError")),
  });

  const doLogin = () => {
    if (!user.trim()) { setLoginError(t("auth.enterUsernameEmail")); return; }
    if (!pass) { setLoginError(t("auth.enterPasswordError")); return; }
    setLoginError("");
    login.mutate({ username: user.trim(), password: pass, rememberMe });
  };
  return (
    <div className="login-card">
      <div className="login-user"><UserRound size={30} /></div>
      <h2>{t("auth.signIn")}</h2>
      <p>{t("auth.signInPrompt")}</p>
      <label>
        {t("auth.usernameOrEmail")}
        <div className="input-icon">
          <UserRound size={16} />
          <input value={user} onChange={(e) => setUser(e.target.value)} placeholder={t("auth.enterUsernameOrEmail")} autoComplete="username" />
        </div>
      </label>
      <label>
        {t("auth.password")}
        <div className="input-icon">
          <LockKeyhole size={16} />
          <input
            type={showPass ? "text" : "password"}
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doLogin()}
            placeholder={t("auth.enterPassword")}
            autoComplete="current-password"
          />
          <button type="button" className="password-toggle" aria-label={showPass ? t("auth.hidePassword") : t("auth.showPassword")} onClick={() => setShowPass((s) => !s)}>
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <button type="button" className="primary-btn full" disabled={login.isPending} onClick={doLogin}>
        {login.isPending ? t("auth.signingIn") : t("auth.signIn")}
      </button>
      {loginError && <div className="login-error" role="alert">{loginError}</div>}
      <div className="login-options">
        <label className="check"><input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> {t("auth.rememberMe")}</label>
        <a href="#forgot" onClick={(e) => { e.preventDefault(); onSwitch("forgot"); }}>{t("auth.forgotPassword")}</a>
      </div>
      <div className="login-footer">
        {t("auth.noAccount")}{" "}
        <a href="#register" onClick={(e) => { e.preventDefault(); onSwitch("register"); }}>{t("auth.createAccount")}</a>
      </div>
    </div>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: (mode: AuthMode) => void }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "", confirmPassword: "", role: "nutrition_officer" as string });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const register = trpc.auth.register.useMutation({
    onSuccess: (r) => { toast.success(r.message); setSubmitted(true); },
    onError: (e) => toast.error(e.message || "Unable to create your account. Please try again."),
  });

  const errors = useMemo(
    () => ({
      name: validateFullName(form.name),
      username: validateUsername(form.username),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword: form.password && !validatePassword(form.password) ? validateConfirmPassword(form.password, form.confirmPassword) : null,
    }),
    [form]
  );

  const passwordStrongErr = useMemo(
    () => form.password && !validatePassword(form.password) ? validatePasswordStrong(form.password, [form.username, form.email.split("@")[0], form.name.trim()]) : null,
    [form.password, form.username, form.email, form.name]
  );

  const showError = (field: keyof typeof errors) => touched[field] && errors[field];

  const submit = () => {
    setTouched({ name: true, username: true, email: true, password: true, confirmPassword: true });
    const allErrors = { ...errors, password: errors.password || passwordStrongErr };
    const firstError = Object.values(allErrors).find(Boolean);
    if (firstError) {
      setAttempted(true);
      return;
    }
    setAttempted(false);
    register.mutate({ name: form.name.trim(), username: form.username.trim(), email: form.email.trim(), password: form.password, confirmPassword: form.confirmPassword, role: form.role });
  };

  if (submitted) {
    return (
      <div className="login-card">
        <div className="login-user"><Check size={30} /></div>
        <h2>Account Created</h2>
        <p>Account created successfully. Your account is pending Administrator approval. You'll be able to sign in once it's approved.</p>
        <button type="button" className="primary-btn full" onClick={() => onSwitch("signin")}>Back to Sign In</button>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-user"><UserRound size={30} /></div>
      <h2>Create Account</h2>
      <p>Register as a Nutrition Officer or Data Manager. An Administrator will review your account.</p>
      {attempted && Object.values({ ...errors, password: errors.password || passwordStrongErr }).some(Boolean) && (
        <div className="login-error" role="alert">Please check your information and try again.</div>
      )}
      <label>
        Full Name
        <div className="input-icon">
          <UserRound size={16} />
          <input className={showError("name") ? "input-error" : ""} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, name: true }))} placeholder="Enter your full name" />
        </div>
        {showError("name") && <span className="field-error-text">{errors.name}</span>}
      </label>
      <label>
        Username
        <div className="input-icon">
          <UserRound size={16} />
          <input className={showError("username") ? "input-error" : ""} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, username: true }))} placeholder="Enter username" />
        </div>
        {showError("username") && <span className="field-error-text">{errors.username}</span>}
      </label>
      <label>
        Email
        <div className="input-icon">
          <Mail size={16} />
          <input className={showError("email") ? "input-error" : ""} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, email: true }))} placeholder="jane@nutrition-dss.org" />
        </div>
        {showError("email") && <span className="field-error-text">{errors.email}</span>}
      </label>
      <label>
        Password
        <div className="input-icon">
          <LockKeyhole size={16} />
          <input className={showError("password") || passwordStrongErr ? "input-error" : ""} type={showPass ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, password: true }))} placeholder="Create a password" />
          <button type="button" className="password-toggle" aria-label={showPass ? "Hide password" : "Show password"} onClick={() => setShowPass((s) => !s)}>
            {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {showError("password") ? <span className="field-error-text">{errors.password}</span> : passwordStrongErr ? <span className="field-error-text">{passwordStrongErr}</span> : <span className="password-strength-hint">Min 8 characters, upper, lower, number, and special character.</span>}
      </label>
      <label>
        Confirm Password
        <div className="input-icon">
          <LockKeyhole size={16} />
          <input className={showError("confirmPassword") ? "input-error" : ""} type={showConfirmPass ? "text" : "password"} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))} placeholder="Repeat password" />
          <button type="button" className="password-toggle" aria-label={showConfirmPass ? "Hide password" : "Show password"} onClick={() => setShowConfirmPass((s) => !s)}>
            {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {showError("confirmPassword") && <span className="field-error-text">{errors.confirmPassword}</span>}
        {touched.confirmPassword && !errors.confirmPassword && form.confirmPassword && form.password === form.confirmPassword && <span className="password-strength-hint">&#10003; Passwords match</span>}
      </label>
      <label>
        Role
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {REGISTERABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </label>
      <button type="button" className="primary-btn full" disabled={register.isPending} onClick={submit}>
        {register.isPending ? "Creating account\u2026" : "Register"}
      </button>
      <div className="login-footer">
        Already have an account?{" "}
        <a href="#signin" onClick={(e) => { e.preventDefault(); onSwitch("signin"); }}>Sign In</a>
      </div>
    </div>
  );
}

function ForgotPasswordForm({ onSwitch }: { onSwitch: (mode: AuthMode) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpId, setOtpId] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [otpTimeLeft, setOtpTimeLeft] = useState("");

  const RESEND_COOLDOWN_SEC = 30;
  const MAX_RESENDS = 4;

  const forgot = trpc.auth.forgotPassword.useMutation({
    onSuccess: (r) => {
      toast.success(r.message);
      if (r.otpId) {
        setOtpId(r.otpId);
        setMaskedEmail(r.maskedEmail);
        setExpiresAt(Date.now() + 7 * 60 * 1000);
        setStep(2);
      } else {
        toast.info("If an account exists, a code has been sent to your email.");
      }
    },
    onError: (e) => toast.error(e.message || "Unable to process this request."),
  });

  const verifyOtpMut = trpc.auth.verifyOtp.useMutation({
    onSuccess: () => { setStep(3); },
    onError: (e) => {
      setOtpError(e.message || "Invalid verification code.");
      setOtp("");
    },
  });

  const resendOtpMut = trpc.auth.resendOtp.useMutation({
    onSuccess: (r) => {
      setResendCount((c) => c + 1);
      setResendCooldown(RESEND_COOLDOWN_SEC);
      setOtp("");
      setOtpError("");
      setExpiresAt(Date.now() + 7 * 60 * 1000);
      toast.success(r.message);
    },
    onError: (e) => toast.error(e.message || "Unable to resend code."),
  });

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => { toast.success("Password reset successfully. You can now sign in."); onSwitch("signin"); },
    onError: (e) => toast.error(e.message || "Unable to reset password."),
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setOtpTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const passwordError = newPassword ? validatePassword(newPassword) : null;
  const passwordStrongErr = newPassword && !passwordError ? validatePasswordStrong(newPassword) : null;
  const confirmError = confirmPassword && newPassword !== confirmPassword ? "Passwords do not match." : null;

  const submitIdentifier = () => {
    if (!identifier.trim()) { toast.error("Please enter your username or email."); return; }
    forgot.mutate({ identifier: identifier.trim() });
  };

  const submitOtp = () => {
    if (!otpId) return;
    if (otp.length !== 6) { setOtpError("Please enter a 6-digit code."); return; }
    setOtpError("");
    verifyOtpMut.mutate({ otpId, otp });
  };

  const submitNewPassword = () => {
    if (!otpId) return;
    if (passwordError) { toast.error(passwordError); return; }
    if (passwordStrongErr) { toast.error(passwordStrongErr); return; }
    if (newPassword !== confirmPassword) { toast.error("Passwords do not match."); return; }
    resetPassword.mutate({ otpId, newPassword, confirmPassword });
  };

  const handleResend = () => {
    if (!otpId || resendCount >= MAX_RESENDS) return;
    resendOtpMut.mutate({ otpId });
  };

  if (step === 3) {
    return (
      <div className="login-card">
        <div className="login-user"><LockKeyhole size={30} /></div>
        <h2>Set New Password</h2>
        <p>Enter your new password below.</p>
        <label>
          New Password
          <div className="input-icon">
            <LockKeyhole size={16} />
            <input type={showPass ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 chars, upper, lower, number, symbol" />
            <button type="button" className="password-toggle" onClick={() => setShowPass((s) => !s)}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {passwordError ? <span className="field-error-text">{passwordError}</span> : passwordStrongErr ? <span className="field-error-text">{passwordStrongErr}</span> : <span className="password-strength-hint">Min 8 characters, upper, lower, number, and special character.</span>}
        </label>
        <label>
          Confirm Password
          <div className="input-icon">
            <LockKeyhole size={16} />
            <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
            <button type="button" className="password-toggle" onClick={() => setShowConfirm((s) => !s)}>
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {confirmError && <span className="field-error-text">{confirmError}</span>}
        </label>
        <button type="button" className="primary-btn full" disabled={resetPassword.isPending} onClick={submitNewPassword}>
          {resetPassword.isPending ? "Resetting\u2026" : "Reset Password"}
        </button>
        <div className="login-footer">
          <a href="#signin" onClick={(e) => { e.preventDefault(); onSwitch("signin"); }}>Back to Sign In</a>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="login-card">
        <div className="login-user"><Mail size={30} /></div>
        <h2>Verify Your Email</h2>
        <p style={{ marginBottom: "4px" }}>
          We've sent a 6-digit verification code to your registered email {maskedEmail ? `ending in ${maskedEmail}` : ""}.
        </p>
        <label>
          Enter OTP
          <div className="input-icon">
            <Mail size={16} />
            <input
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
              onKeyDown={(e) => e.key === "Enter" && submitOtp()}
              placeholder="Enter 6-digit code"
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
            />
          </div>
          {otpError && <span className="field-error-text">{otpError}</span>}
        </label>
        <button type="button" className="primary-btn full" disabled={verifyOtpMut.isPending} onClick={submitOtp}>
          {verifyOtpMut.isPending ? "Verifying\u2026" : "Verify OTP"}
        </button>
        <div style={{ marginTop: "12px", fontSize: "12px", color: "#718096" }}>
          <div style={{ marginBottom: "6px" }}>
            Didn't receive the code?{" "}
            <button
              type="button"
              disabled={resendCooldown > 0 || resendCount >= MAX_RESENDS || resendOtpMut.isPending}
              onClick={handleResend}
              style={{ background: "none", border: "none", color: resendCooldown > 0 || resendCount >= MAX_RESENDS ? "#999" : "#1265d8", cursor: resendCooldown > 0 || resendCount >= MAX_RESENDS ? "default" : "pointer", padding: 0, fontSize: "12px", textDecoration: "underline" }}
            >
              {resendCooldown > 0 ? `Resend OTP (available in ${resendCooldown}s)` : resendCount >= MAX_RESENDS ? "Max resends reached" : "Resend OTP"}
            </button>
          </div>
          {otpTimeLeft && <div>Code expires in <strong>{otpTimeLeft}</strong></div>}
          {resendCount >= MAX_RESENDS && <div style={{ color: "#ef4444", marginTop: "4px" }}>Maximum resend attempts reached. Please go back and start over.</div>}
        </div>
        <div className="login-footer">
          <a href="#forgot" onClick={(e) => { e.preventDefault(); setStep(1); setOtp(""); setOtpError(""); }}>Start over</a>
          {" "}|{" "}
          <a href="#signin" onClick={(e) => { e.preventDefault(); onSwitch("signin"); }}>Back to Sign In</a>
        </div>
      </div>
    );
  }

  // Step 1: Enter username or email
  return (
    <div className="login-card">
      <div className="login-user"><Mail size={30} /></div>
      <h2>Forgot Password</h2>
      <p>Enter your username or email and we'll send you a verification code.</p>
      <label>
        Username or Email
        <div className="input-icon">
          <UserRound size={16} />
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitIdentifier()}
            placeholder="Enter username or email"
            autoFocus
          />
        </div>
      </label>
      <button type="button" className="primary-btn full" disabled={forgot.isPending} onClick={submitIdentifier}>
        {forgot.isPending ? "Sending\u2026" : "Send Verification Code"}
      </button>
      <p style={{ marginTop: "12px", fontSize: "11px", color: "#718096" }}>
        <span style={{ color: "#718096", textDecoration: "underline" }}>Forgot your registered email?</span> Contact the Administrator for account recovery.
      </p>
      <div className="login-footer">
        Remembered your password?{" "}
        <a href="#signin" onClick={(e) => { e.preventDefault(); onSwitch("signin"); }}>Sign In</a>
      </div>
    </div>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  return (
    <div className="login-page">
      <LoginHero />
      <section className="login-panel">
        <div className="login-language"><LanguageSwitcher /></div>
        {mode === "signin" && <SignInForm onSwitch={setMode} />}
        {mode === "register" && <RegisterForm onSwitch={setMode} />}
        {mode === "forgot" && <ForgotPasswordForm onSwitch={setMode} />}
      </section>
    </div>
  );
}

/**
 * Blocking gate shown after login when the account has mustChangePassword
 * set (currently: the seeded Administrator's first login). The rest of the
 * app is inaccessible until a new password is set.
 */
export function ForcedPasswordChange() {
  const utils = trpc.useUtils();
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("Password changed successfully.");
      await utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message || "Unable to change password."),
  });
  const strengthError = pw.next ? validatePassword(pw.next) : null;
  const submit = () => {
    if (!pw.current) { toast.error("Please enter your current password."); return; }
    if (strengthError) { toast.error(strengthError); return; }
    if (pw.next !== pw.confirm) { toast.error("Passwords do not match."); return; }
    if (pw.next === pw.current) { toast.error("New password must be different from your current password."); return; }
    changePassword.mutate({ currentPassword: pw.current, newPassword: pw.next, confirmPassword: pw.confirm });
  };
  return (
    <div className="forced-change-overlay">
      <div className="forced-change-card">
        <h2>Set a New Password</h2>
        <p>For security, you must change the default password before continuing.</p>
        <label>Current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Default password" /></label>
        <label>New password<input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} placeholder="Min 8 chars, upper, lower, number, symbol" /></label>
        {strengthError && <span className="field-error-text">{strengthError}</span>}
        <label>Confirm new password<input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} placeholder="Repeat new password" /></label>
        <button type="button" className="primary-btn full" disabled={changePassword.isPending} onClick={submit}>
          {changePassword.isPending ? "Updating\u2026" : "Change Password"}
        </button>
      </div>
    </div>
  );
}

function DashboardCharts({ stats, range, onRangeChange, onRiskClick }: { stats: any; range: string; onRangeChange: (r: string) => void; onRiskClick?: (level: string) => void }) {
  const { t } = useTranslation();
  const risk = Array.isArray(stats?.riskDistribution) ? (stats.riskDistribution as Array<{ label: string; value: number }>) : [];
  const activity = Array.isArray(stats?.activitySeries) ? (stats.activitySeries as Array<{ date: string; value: number }>) : [];
  const riskTotal = risk.reduce((sum, item) => sum + item.value, 0);
  const activityMax = Math.max(1, ...activity.map((item) => item.value));
  const riskColors: { [key: string]: string } = { High: "#ef4444", Moderate: "#f59b18", Low: "#22a34a" };
  const donut = riskTotal
    ? `conic-gradient(${risk
        .map((item, index) => {
          const start = risk.slice(0, index).reduce((sum, current) => sum + current.value, 0) / riskTotal * 100;
          const end = (start + item.value / riskTotal * 100).toFixed(2);
          return `${riskColors[item.label] ?? ["#1c73e8", "#7651d6", "#20a34a"][index % 3]} ${start.toFixed(2)}% ${end}%`;
        })
        .join(", ")})`
    : "#e7edf5";
  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return (
    <div className="dashboard-charts">
      <section className="panel chart-card">
        <div className="panel-heading">
          <div><h2>{t("dashboard.assessmentActivity", { defaultValue: "Assessment Activity" })}</h2><p>{t("dashboard.dailyCounts", { defaultValue: "Daily assessment counts" })}</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="range-selector">
              {["7", "30", "90"].map((r) => (
                <button key={r} className={`range-btn${range === r ? " active" : ""}`} onClick={() => onRangeChange(r)}>
                  {r}d
                </button>
              ))}
            </div>
            <BarChart3 size={20} className="chart-heading-icon" />
          </div>
        </div>
        {activity.length ? (
          <div className="dashboard-bars">
            {activity.map((item) => (
              <div className="dashboard-bar-group" key={item.date}>
                <div className="dashboard-bar-track">
                  <div className="dashboard-bar" style={{ height: `${Math.max(8, (item.value / activityMax) * 100)}%` }} title={`${item.value} assessments on ${formatDay(item.date)}`} />
                </div>
                <span>{formatDay(item.date)}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="module-state empty-state">
            <div className="empty-icon"><BarChart3 size={28} /></div>
            <p>{t("dashboard.noActivity", { defaultValue: "No assessment activity in this period." })}</p>
          </div>
        )}
      </section>
      <section className="panel chart-card">
        <div className="panel-heading">
          <div><h2>{t("dashboard.riskDistribution", { defaultValue: "Risk Distribution" })}</h2><p>{t("dashboard.clickCategory", { defaultValue: "Click a category to filter" })}</p></div>
          <Gauge size={20} className="chart-heading-icon" />
        </div>
        {risk.length && riskTotal ? (
          <div className="donut-layout">
            <div className="donut-chart" style={{ background: donut }}>
              <div className="donut-hole"><strong>{riskTotal}</strong><span>cases</span></div>
            </div>
            <div className="donut-legend">
              {risk.map((item) => (
                <button key={item.label} className="donut-legend-item" onClick={() => onRiskClick?.(item.label)}>
                  <span className="donut-swatch" style={{ background: riskColors[item.label] ?? "#999" }} />
                  <span className="donut-legend-label">{item.label}</span>
                  <span className="donut-legend-value">{item.value}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="module-state empty-state">
            <div className="empty-icon"><Gauge size={28} /></div>
            <p>No risk distribution data available yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function PriorityChildrenTable({ children: items, onView }: { children: Array<{ predictionId: string; childId: string; ageMonths: number | null; sex: string | null; prediction: string; riskLevel: string; probability: number; riskScore: number; createdAt: string }>; onView: (predictionId: string) => void }) {
  if (!items.length) {
    return (
      <div className="module-state empty-state">
        <div className="empty-icon"><ShieldCheck size={28} /></div>
        <p>No high-risk children at this time.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Child ID</th>
            <th>Age</th>
            <th>Sex</th>
            <th>Stunting Result</th>
            <th>Risk Level</th>
            <th>Probability</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.predictionId}>
              <td className="mono">{c.childId}</td>
              <td>{c.ageMonths != null ? `${c.ageMonths} mo` : "\u2014"}</td>
              <td>{c.sex ?? "\u2014"}</td>
              <td>{c.prediction}</td>
              <td><RiskBadge level={c.riskLevel} /></td>
              <td className="mono">{(c.probability * 100).toFixed(1)}%</td>
              <td>{new Date(c.createdAt).toLocaleDateString()}</td>
              <td><button className="table-action" onClick={() => onView(c.predictionId)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentAssessmentsTable({ items, onView }: { items: Array<{ predictionId: string; childId: string; ageMonths: number | null; sex: string | null; prediction: string; riskLevel: string; probability: number; riskScore: number; createdAt: string }>; onView: (predictionId: string) => void }) {
  if (!items.length) {
    return (
      <div className="module-state empty-state">
        <div className="empty-icon"><FileText size={28} /></div>
        <p>No assessments have been recorded yet.</p>
        <Link href="/prediction/new" className="primary-btn" style={{ marginTop: "12px" }}>Start New Assessment</Link>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Assessment ID</th>
            <th>Child ID</th>
            <th>Date</th>
            <th>Result</th>
            <th>Risk Level</th>
            <th>Probability</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.predictionId}>
              <td className="mono">{a.predictionId}</td>
              <td>{a.childId}</td>
              <td>{new Date(a.createdAt).toLocaleDateString()}</td>
              <td>{a.prediction}</td>
              <td><RiskBadge level={a.riskLevel} /></td>
              <td className="mono">{(a.probability * 100).toFixed(1)}%</td>
              <td><button className="table-action" onClick={() => onView(a.predictionId)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Home({ onLogout }: { onLogout: () => void }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [range, setRange] = useState("7");
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const { user } = useAuth();
  const role = (user?.role as Role) ?? "nutrition_officer";
  const stats = trpc.dashboard.stats.useQuery({ range: range as "7" | "30" | "90" });
  const summary = stats.data;

  const handleRiskClick = (level: string) => {
    setRiskFilter(riskFilter === level ? null : level);
  };

  const handleView = (predictionId: string) => {
    navigate(`/prediction/results/${predictionId}`);
  };

  const isLoading = stats.isLoading;
  const isError = stats.isError;

  const showAdminCards = role === "admin";
  const showOfficerCards = role === "nutrition_officer";
  const showDataManagerCards = role === "data_manager";

  return (
    <Shell title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} onLogout={onLogout}>
      <div className="page-content">
        <div className="breadcrumb">{t("dashboard.home")} <ChevronRight size={13} /> {t("dashboard.title")}</div>

        {isLoading && (
          <div className="module-state loading-state">
            <div className="loading-spinner" />
            <p>{t("dashboard.loading")}</p>
          </div>
        )}

        {isError && (
          <div className="module-state error-state">
            <AlertTriangle size={20} />
            <p>{t("dashboard.loadError")}</p>
            <button className="secondary-btn" onClick={() => stats.refetch()}>{t("dashboard.retry")}</button>
          </div>
        )}

        {!isLoading && !isError && summary && (
          <>
            <div className="stats-grid">
              {(showAdminCards || showOfficerCards) && (
                <>
                  <StatCard icon={<BarChart3 size={21} />} color="#1c73e8" value={summary.totalPredictions.toLocaleString()} label={t("dashboard.totalAssessments")} detail={t("dashboard.persistedRecords")} />
                  <StatCard icon={<ShieldCheck size={21} />} color="#ef4444" value={summary.highRiskCases.toLocaleString()} label={t("dashboard.highRiskCases")} detail={t("dashboard.requireAttention")} />
                </>
              )}
              {showAdminCards && (
                <>
                  <StatCard icon={<Users size={21} />} color="#7651d6" value={summary.totalChildren.toLocaleString()} label={t("dashboard.childrenAssessed")} detail={t("dashboard.uniqueChildren")} />
                  <StatCard icon={<FileText size={21} />} color="#16b894" value={summary.reportsGenerated.toLocaleString()} label={t("dashboard.reportsGenerated")} detail={t("dashboard.totalReports")} />
                </>
              )}
              {showOfficerCards && (
                <>
                  <StatCard icon={<Gauge size={21} />} color="#f59b18" value={`${(summary.highRiskRate * 100).toFixed(1)}%`} label="High Risk Rate" detail="current dataset" />
                  <StatCard icon={<FileText size={21} />} color="#16b894" value={summary.avgRiskScore.toLocaleString()} label="Avg Risk Score" detail="risk score 0\u2013100" />
                </>
              )}
              {showDataManagerCards && (
                <>
                  <StatCard icon={<Users size={21} />} color="#7651d6" value={summary.totalChildren.toLocaleString()} label={t("dashboard.childrenInSystem")} detail={t("dashboard.totalRecords")} />
                  <StatCard icon={<BarChart3 size={21} />} color="#1c73e8" value={summary.totalPredictions.toLocaleString()} label={t("dashboard.totalAssessments")} detail={t("dashboard.persistedRecords")} />
                </>
              )}
            </div>

            <DashboardCharts stats={summary} range={range} onRangeChange={setRange} onRiskClick={handleRiskClick} />

            {summary.priorityChildren && summary.priorityChildren.length > 0 && (
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>{t("dashboard.priorityChildren")}</h2><p>{t("dashboard.priorityDescription")}</p></div>
                  <Link href="/history" className="view-all">{t("dashboard.viewAll")} <ChevronRight size={15} /></Link>
                </div>
                <PriorityChildrenTable children={summary.priorityChildren} onView={handleView} />
              </section>
            )}

            <section className="panel">
              <div className="panel-heading">
                <div><h2>{t("dashboard.recentAssessments")}</h2><p>{t("dashboard.recentDescription")}</p></div>
                <Link href="/history" className="view-all">{t("dashboard.viewAll")} <ChevronRight size={15} /></Link>
              </div>
              <RecentAssessmentsTable items={summary.recentAssessments} onView={handleView} />
            </section>

            <div className="dashboard-lower">
              <section className="panel quick-panel">
                <div className="panel-heading">
                  <div><h2>{t("dashboard.quickActions")}</h2><p>{t("dashboard.quickDescription")}</p></div>
                </div>
                <div className="quick-actions">
                  <Link href="/prediction/new" className="quick-action">
                    <div className="qa-icon" style={{ background: "#1c73e8" }}><AlertTriangle size={18} /></div>
                    <div><b>{t("dashboard.newAssessment")}</b><span>{t("dashboard.newAssessmentDescription")}</span></div>
                  </Link>
                  <Link href="/history" className="quick-action">
                    <div className="qa-icon" style={{ background: "#7651d6" }}><FileText size={18} /></div>
                    <div><b>{t("dashboard.predictionHistory")}</b><span>{t("dashboard.predictionHistoryDescription")}</span></div>
                  </Link>
                  {showAdminCards && (
                    <Link href="/users" className="quick-action">
                      <div className="qa-icon" style={{ background: "#20a34a" }}><Users size={18} /></div>
                      <div><b>{t("dashboard.manageUsers")}</b><span>{t("dashboard.manageUsersDescription")}</span></div>
                    </Link>
                  )}
                </div>
              </section>
            </div>
          </>
        )}

        {!isLoading && !isError && !summary && (
          <div className="module-state empty-state">
            <div className="empty-icon"><BarChart3 size={32} /></div>
            <h3>{t("dashboard.noData")}</h3>
            <p>{t("dashboard.noDataDescription")}</p>
            <Link href="/prediction/new" className="primary-btn" style={{ marginTop: "12px" }}>{t("dashboard.startAssessment")}</Link>
          </div>
        )}
      </div>
    </Shell>
  );
}

const assessmentSteps = [
  { label: "Child", icon: "1" },
  { label: "Maternal", icon: "2" },
  { label: "Household", icon: "3" },
  { label: "Review", icon: "4" },
];

type AssessmentField = {
  label: string;
  key: string;
  modelVar: string;
  type: "text" | "number" | "select";
  required: boolean;
  options?: string[];
  min?: number;
  max?: number;
  hint?: string;
};

const assessmentFieldSets: AssessmentField[][] = [
  [
    { label: "Child ID", key: "childId", modelVar: "childId", type: "childSelect" as any, required: true, hint: "Select a registered child" },
    { label: "Child age", key: "CAGE", modelVar: "CAGE", type: "number", required: true, min: 0, max: 120, hint: "Age in months (0–120)" },
    { label: "Child weight", key: "WB4", modelVar: "WB4", type: "number", required: true, min: 0, hint: "Weight in kilograms" },
    { label: "Child sex", key: "HL4", modelVar: "HL4", type: "select", required: true, options: ["Masculin", "Féminin"] },
  ],
  [
    { label: "Mother's age", key: "WAGEM", modelVar: "WAGEM", type: "number", required: true, min: 10, max: 65, hint: "Age in years" },
    { label: "Children ever born", key: "CEB", modelVar: "CEB", type: "number", required: true, min: 0, hint: "Total live births" },
    { label: "Children currently surviving", key: "CSURV", modelVar: "CSURV", type: "number", required: true, min: 0, hint: "Living children" },
    { label: "Children who have died", key: "CDEAD", modelVar: "CDEAD", type: "number", required: true, min: 0, hint: "Deceased children" },
    { label: "Birth interval", key: "CM11", modelVar: "CM11", type: "number", required: true, min: 0, max: 120, hint: "Months since previous birth" },
    { label: "Mother's marital status", key: "MSTATUS", modelVar: "MSTATUS", type: "select", required: true, options: ["Actuellement mariée/ou en union", "Formellement mariée /ou en union", "Jamais mariée /en union"] },
    { label: "Recent live birth", key: "CM17", modelVar: "CM17", type: "select", required: true, options: ["Au moins une naissance vivante dans les 2 dernières années", "Pas de naissances vivantes dans les 2 dernières années"] },
  ],
  [
    { label: "Place of residence", key: "HH6", modelVar: "HH6", type: "select", required: true, options: ["Rural", "Urbain"] },
    { label: "Household wealth level", key: "windex5", modelVar: "windex5", type: "select", required: true, options: ["Le plus pauvre", "Le plus riche", "Pauvre", "Moyen", "Riche"] },
    { label: "Drinking water source", key: "WS1", modelVar: "WS1", type: "select", required: true, options: [
      "PUITS A POMPE/FORAGE", "SOURCE: SOURCE NON PROTEGEE", "PUITS CREUSE: PAS PROTEGE",
      "ROBINET: ROBIENT PUBLIC/BORNE FONTAINE", "PUITS CREUSE: PROTEGE",
      "EAU DE SURFACE (RIVIERE, BARRAGE, LAC, MARE, COURANT, CANAL, SYSTEME D'IRRIGATION)",
      "SOURCE: SOURCE PROTEGEE", "ROBINET: CHEZ LE VOISIN",
      "ROBINET: DANS LA CONCESSION/JARDIN/PARCELLE", "ROBINET: DANS LE LOGEMENT",
      "KIOSQUE A EAU", "CAMION CITERNE", "EAU DE PLUIE", "EAU CONDITIONNEE: EAU EN SACHET", "AUTRE", "CHARRETTE AVEC PETITE CITERNE",
    ] },
    { label: "Toilet facility", key: "WS11", modelVar: "WS11", type: "select", required: true, options: [
      "LATRINE A FOSSE: SANS DALLE/FOSSE OUVERTE", "PAS DE TOILETTES/ NATURE/CHAMPS",
      "LATRINE A FOSSE: AVEC DALLE", "TOILETTE A COMPOSTAGE",
      "TOILETTE SUSPENDUES/LATRINES SUSPENDUES", "CHASSE D'EAU: RELIEE AUX LATRINES",
      "LATRINE A FOSSE: AMELIOREE VENTILEE", "CHASSE D'EAU: RELIEE A FOSSE SCEPTIQUE",
      "CHASSE D'EAU: RELIEE A SYSTEME D'EGOUTS", "CHASSE D'EAU: RELIEE A L'AIR LIBRE",
      "AUTRE", "CHASSE D'EAU: RELIEE A LIEU INCONNU",
    ] },
    { label: "Household water treatment", key: "WS15", modelVar: "WS15", type: "select", required: true, options: ["OUI", "NON"] },
    { label: "Mother's education level", key: "welevel", modelVar: "welevel", type: "select", required: true, options: ["Préscolaire ou aucun", "Fondamental 1", "Fondamental 2", "Secondaire ou plus"] },
    { label: "Health insurance coverage", key: "insurance", modelVar: "insurance", type: "select", required: true, options: ["Sans assurance", "Avec assurance"] },
  ],
];

const allPredictorFields = assessmentFieldSets.flat().filter((f) => f.key !== "childId");

function validateNumericField(field: AssessmentField, value: string): string | null {
  if (!value || value.trim() === "") return null;
  const num = Number(value);
  if (isNaN(num)) return `${field.label} must be a number.`;
  if (field.min !== undefined && num < field.min) {
    if (field.key === "CAGE") return `Age cannot be negative.`;
    return `${field.label} must be at least ${field.min}.`;
  }
  if (field.max !== undefined && num > field.max) {
    if (field.key === "CAGE") return `Age must be between 0 and 120 months.`;
    return `${field.label} must be at most ${field.max}.`;
  }
  return null;
}

function countCompletePredictors(form: Record<string, string>): number {
  return allPredictorFields.filter((f) => {
    const v = form[f.key];
    return v !== undefined && v !== null && v !== "";
  }).length;
}

function normalizeSex(value: string): string {
  const lower = value.toLowerCase();
  if (lower === "male" || lower === "masculin") return "Masculin";
  if (lower === "female" || lower === "féminin" || lower === "feminin" || lower === "f\u00e9minin") return "Féminin";
  return value;
}

const MATERNAL_HOUSEHOLD_KEYS = ["WAGEM", "CEB", "CSURV", "CDEAD", "CM11", "MSTATUS", "CM17", "HH6", "windex5", "WS1", "WS11", "WS15", "welevel", "insurance"];

export function PredictionForm({ onComplete }: { onComplete: (r: Result) => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [predictionError, setPredictionError] = useState("");
  const [assessPhase, setAssessPhase] = useState<"idle" | "preparing" | "running" | "results">("idle");
  const [lookupId, setLookupId] = useState("");
  const [lookupData, setLookupData] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [mode, setMode] = useState<"new" | "lookup">("new");
  const [showNewChild, setShowNewChild] = useState(false);
  const [newChildId, setNewChildId] = useState("");
  const [selectedChildWeight, setSelectedChildWeight] = useState<string | null>(null);

  const predictionAssess = trpc.prediction.assess.useMutation();
  const lookupQuery = trpc.prediction.lookup.useQuery({ childId: lookupId }, { enabled: false });
  const childrenQuery = trpc.data.children.useQuery();
  const predictionsQuery = trpc.data.predictions.useQuery();
  const generateIdQuery = trpc.prediction.generateId.useQuery(undefined, { enabled: false });

  const currentFields: AssessmentField[] = assessmentFieldSets[step] ?? [];
  const fieldLabels: Record<string, string> = { childId: t("prediction.childId"), CAGE: t("prediction.childAge"), WB4: t("prediction.childWeight"), HL4: t("prediction.childSex"), WAGEM: t("prediction.mothersAge") };
  const fieldHints: Record<string, string> = { CAGE: t("prediction.ageMonths"), WB4: t("prediction.weightKilograms") };
  const totalPredictors = allPredictorFields.length;
  const completeCount = countCompletePredictors(form);

  const update = (key: string, v: string) => {
    if (key === "HL4") console.log("[Update] Setting HL4 to:", v, "charCodes:", [...v].map(c => c.charCodeAt(0)));
    setForm((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleChildSelect = (childIdStr: string) => {
    if (childIdStr === "__new__") {
      setShowNewChild(true);
      setNewChildId("");
      setSelectedChildWeight(null);
      update("childId", "");
      startNewChildRegistration();
      return;
    }
    setShowNewChild(false);
    setSelectedChildWeight(null);
    const allChildren = (childrenQuery.data ?? []) as any[];
    const child = allChildren.find((c: any) => String(c.childId) === childIdStr);
    console.log("[ChildSelect] childIdStr:", childIdStr, "found:", !!child, "allChildren count:", allChildren.length);
    if (child) {
      console.log("[ChildSelect] child.sex:", child.sex, "normalized:", normalizeSex(child.sex));
      update("childId", String(child.childId));
      if (child.ageMonths != null) update("CAGE", String(child.ageMonths));
      if (child.sex) update("HL4", normalizeSex(child.sex));
      if (child.weightKg != null) setSelectedChildWeight(String(child.weightKg));

      const preds = (predictionsQuery.data ?? []) as any[];
      const childNumericId = child.id;
      const lastPred = preds.find((p: any) => p.childId === childNumericId);
      if (lastPred?.inputData) {
        const data = typeof lastPred.inputData === "string" ? JSON.parse(lastPred.inputData) : lastPred.inputData;
        for (const key of MATERNAL_HOUSEHOLD_KEYS) {
          if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
            update(key, String(data[key]));
          }
        }
      }
    }
  };

  const startNewChildRegistration = async () => {
    const r = await generateIdQuery.refetch();
    if (r.data?.childId) {
      setNewChildId(r.data.childId);
      update("childId", r.data.childId);
    }
  };

  const validateStep = (stepIndex: number): boolean => {
    const fields = assessmentFieldSets[stepIndex];
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const v = form[field.key];
      if (field.required && (v === undefined || v === null || v === "")) {
        newErrors[field.key] = `${field.label} is required.`;
        continue;
      }
      if (field.type === "number" && v) {
        const err = validateNumericField(field, v);
        if (err) newErrors[field.key] = err;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const doLookup = async () => {
    if (!lookupId.trim()) { toast.error("Please enter a Child ID to track."); return; }
    setLookupLoading(true);
    setLookupError("");
    try {
      const result = await lookupQuery.refetch();
      if (result.data) { setLookupData(result.data); setMode("lookup"); }
      else { setLookupError("No child found with that ID."); }
    } catch { setLookupError("No child found with that ID."); }
    finally { setLookupLoading(false); }
  };

  const startNew = () => { setMode("new"); setLookupData(null); setLookupId(""); setStep(0); setForm({}); setErrors({}); setPredictionError(""); setAssessPhase("idle"); setShowNewChild(false); setNewChildId(""); setSelectedChildWeight(null); };

  const goNext = () => {
    if (step < 3) {
      if (!validateStep(step)) return;
      setStep(step + 1);
      return;
    }
  };

  const runAssessment = () => {
    const missing = allPredictorFields.filter((f) => form[f.key] === undefined || form[f.key] === null || form[f.key] === "");
    if (missing.length) {
      setPredictionError(`⚠ ${missing.length} required field(s) are missing. Please go back and complete all fields.`);
      return;
    }
    for (const field of allPredictorFields) {
      if (field.type === "number" && form[field.key]) {
        const err = validateNumericField(field, form[field.key]);
        if (err) { setPredictionError(`⚠ Validation error: ${err}`); return; }
      }
    }
    setPredictionError("");
    setAssessPhase("preparing");
    setTimeout(() => setAssessPhase("running"), 600);
    predictionAssess.mutate(
      {
        childId: showNewChild ? newChildId : form.childId,
        CAGE: form.CAGE, WB4: form.WB4, WAGEM: form.WAGEM, CEB: form.CEB,
        CSURV: form.CSURV, CDEAD: form.CDEAD, CM11: form.CM11,
        HL4: form.HL4, HH6: form.HH6, windex5: form.windex5,
        WS1: form.WS1, WS11: form.WS11, WS15: form.WS15,
        welevel: form.welevel, MSTATUS: form.MSTATUS, CM17: form.CM17,
        insurance: form.insurance,
      },
      {
        onSuccess: (result: any) => {
          setAssessPhase("results");
          const dssResult: DssResult = {
            childId: result.childId,
            predictions: result.predictions,
            model_info: result.model_info,
            feature_importance: result.feature_importance,
            recommendations: result.recommendations,
            combinedRisk: result.combinedRisk,
            officer: result.officer,
            generatedAt: result.generatedAt,
          };
          const primary = dssResult.predictions.stunting;
          onComplete({
            predictionId: result.predictionId,
            childId: dssResult.childId,
            age: form.CAGE,
            sex: form.HL4,
            probability: primary.probability,
            riskScore: Math.round(primary.probability * 100),
            risk: dssResult.combinedRisk,
            prediction: primary.classification,
            dssResult,
          });
        },
        onError: (e: any) => {
          setAssessPhase("idle");
          const msg = e.message || "";
          if (msg.includes("unavailable") || msg.includes("ECONNREFUSED") || msg.includes("spawn")) {
            setPredictionError("The prediction service is temporarily unavailable. Please try again.");
          } else {
            setPredictionError(msg || "Assessment could not be completed. Please check the highlighted inputs and try again.");
          }
        },
      }
    );
  };

  const renderFieldValue = (field: AssessmentField) => {
    const v = form[field.key];
    if (!v) return "\u2014";
    if (field.key === "CAGE") return `${v} months`;
    if (field.key === "WB4") return `${v} kg`;
    if (field.key === "WAGEM") return `${v} years`;
    if (field.key === "CM11") return `${v} months`;
    return v;
  };

  if (mode === "lookup" && lookupData) {
    return (
      <Shell title={t("routes.newPrediction")} subtitle={t("routes.newPredictionEnter")}>
        <div className="page-content narrow">
          <div className="breadcrumb"><Link href="/dashboard">{t("dashboard.home")}</Link><ChevronRight size={13} /> {t("routes.newPrediction")}</div>
          <section className="panel form-panel">
            <div className="panel-heading">
              <div><h2>Child Record: {lookupData.child.childId}</h2></div>
              <button className="secondary-btn" onClick={startNew}>Back to Form</button>
            </div>
            <dl className="summary-list">
              <dt>Child ID</dt><dd>{lookupData.child.childId}</dd>
              <dt>Age</dt><dd>{lookupData.child.ageMonths} months</dd>
              <dt>Sex</dt><dd>{lookupData.child.sex}</dd>
              <dt>Registered</dt><dd>{new Date(lookupData.child.createdAt).toLocaleDateString()}</dd>
            </dl>
            {lookupData.predictions?.length > 0 && (
              <section className="panel" style={{ marginTop: "1rem" }}>
                <div className="panel-heading"><h2>Prediction History</h2></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ID</th><th>Date</th><th>Risk</th><th>Prediction</th><th>Probability</th></tr></thead>
                    <tbody>
                      {lookupData.predictions.map((p: any) => (
                        <tr key={p.id}>
                          <td className="mono">{p.predictionId}</td>
                          <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td><RiskBadge level={p.riskLevel} /></td>
                          <td>{p.prediction}</td>
                          <td className="mono">{p.probability}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
          <div style={{ marginTop: "1rem", padding: "0 1.5rem 1.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <div className="input-icon" style={{ flex: 1 }}>
                <Search size={16} />
                <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLookup()} placeholder="Have a Child ID? Enter it here to track..." />
              </div>
              <button className="secondary-btn" onClick={doLookup} disabled={lookupLoading}>{lookupLoading ? "Searching..." : "Track Child"}</button>
            </div>
            {lookupError && <div className="login-error" role="alert" style={{ marginTop: "0.5rem" }}>{lookupError}</div>}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={t("routes.newPrediction")} subtitle={t("routes.newPredictionAssess")}>
      <div className="page-content narrow">
        <div className="breadcrumb"><Link href="/dashboard">{t("dashboard.home")}</Link><ChevronRight size={13} /> {t("routes.newPrediction")}</div>
        <section className="panel form-panel">
          <div className="panel-heading">
            <div><h2>{t("prediction.title")}</h2><p>{t("prediction.description")}</p></div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: completeCount === totalPredictors ? "#16a34a" : "#64748b" }}>
                {completeCount === totalPredictors ? "\u2713" : "\u26A0"} {t("prediction.inputsComplete", { complete: completeCount, total: totalPredictors })}
              </div>
            </div>
          </div>

          <div className="step-tabs">
            {assessmentSteps.map((s, i) => (
              <button key={s.label} className={step === i ? "step-tab active" : step > i ? "step-tab completed" : "step-tab"} onClick={() => i <= step && setStep(i)}>
                <span>{i + 1}.</span> {t(`prediction.${s.label.toLowerCase()}`)}
              </button>
            ))}
          </div>

          {predictionError && <div className="login-error" role="alert" style={{ margin: "0 1.5rem" }}>{predictionError}</div>}

          {assessPhase !== "idle" ? (
            <div className="assessment-loading">
              <div className="loading-spinner" />
              <div className="assessment-loading-text">
                {assessPhase === "preparing" && t("prediction.preparing")}
                {assessPhase === "running" && t("prediction.running")}
                {assessPhase === "results" && t("prediction.generating")}
              </div>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>This may take a few moments while the model processes the data.</p>
            </div>
          ) : (
            <>
              {step < 3 && (
                <div className="form-grid">
                  {currentFields.map((field) => {
                    const fieldError = errors[field.key];
                    if ((field as any).type === "childSelect") {
                      const children = (childrenQuery.data ?? []) as any[];
                      return (
                        <label key={field.key} className={fieldError ? "field-error" : ""}>
                          <span className="field-label-text">{fieldLabels[field.key] ?? field.label} <span className="model-var">({field.modelVar})</span></span>
                          {field.required && <em>*</em>}
                          <select value={showNewChild ? "__new__" : (form[field.key] || "")} onChange={(e) => handleChildSelect(e.target.value)} className={fieldError ? "input-error" : ""}>
                            <option value="">{t("prediction.selectChild")}</option>
                            {children.map((c: any) => <option key={c.id} value={String(c.childId)}>{c.childId} — {c.sex ?? "—"}, {c.ageMonths != null ? `${c.ageMonths} mo` : "—"}</option>)}
                            <option value="__new__">{t("prediction.registerChild")}</option>
                          </select>
                          {showNewChild && (
                            <div style={{ marginTop: "6px", padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "11px" }}>
                              <span style={{ fontWeight: 600 }}>New Child ID: </span>
                              <span style={{ fontFamily: "monospace", color: "#16b894" }}>{newChildId || "Generating..."}</span>
                              <span style={{ marginLeft: "8px", color: "#64748b" }}>— complete age, weight, and sex below to register.</span>
                            </div>
                          )}
                          {fieldError && <span className="field-error-text">{fieldError}</span>}
                        </label>
                      );
                    }
                    if (field.type === "select") {
                      const isCarryForward = MATERNAL_HOUSEHOLD_KEYS.includes(field.key) && form[field.key];
                      return (
                        <label key={field.key} className={fieldError ? "field-error" : ""}>
                          <span className="field-label-text">{fieldLabels[field.key] ?? field.label} <span className="model-var">({field.modelVar})</span></span>
                          {field.required && <em>*</em>}
                          <select value={form[field.key] || ""} onChange={(e) => update(field.key, e.target.value)} className={fieldError ? "input-error" : ""}>
                            <option value="">{t("prediction.select")}</option>
                            {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {isCarryForward && !showNewChild && (
                            <span style={{ display: "inline-block", marginTop: "3px", fontSize: "10px", fontWeight: 600, color: "#6366f1", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: "4px", padding: "1px 6px" }}>
                              Pre-filled from last visit — update if changed
                            </span>
                          )}
                          {fieldError && <span className="field-error-text">{fieldError}</span>}
                        </label>
                      );
                    }
                    return (
                      <label key={field.key} className={fieldError ? "field-error" : ""}>
                        <span className="field-label-text">{fieldLabels[field.key] ?? field.label} <span className="model-var">({field.modelVar})</span></span>
                        {field.required && <span className="req">*</span>}
                        <input
                          type={field.type}
                          value={form[field.key] || ""}
                          onChange={(e) => update(field.key, e.target.value)}
                          placeholder={fieldHints[field.key] ?? field.hint ?? fieldLabels[field.key] ?? field.label}
                          className={fieldError ? "input-error" : ""}
                        />
                        {field.key === "WB4" && selectedChildWeight && (
                          <span style={{ display: "inline-block", marginTop: "5px", padding: "3px 8px", fontSize: "11px", fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                            Last recorded: {selectedChildWeight} kg — enter today's measurement
                          </span>
                        )}
                        {MATERNAL_HOUSEHOLD_KEYS.includes(field.key) && form[field.key] && !showNewChild && field.key !== "WB4" && (
                          <span style={{ display: "inline-block", marginTop: "3px", fontSize: "10px", fontWeight: 600, color: "#6366f1", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: "4px", padding: "1px 6px" }}>
                            Pre-filled from last visit — update if changed
                          </span>
                        )}
                        {fieldError && <span className="field-error-text">{fieldError}</span>}
                      </label>
                    );
                  })}
                </div>
              )}

              {step === 3 && (
                <div className="review-panel">
                  <div className="review-section">
                    <h3>{t("prediction.childInformation")}</h3>
                    <dl className="review-grid">
                      {assessmentFieldSets[0].map((f) => (
                        <span key={f.key}><dt>{f.label}</dt><dd>{renderFieldValue(f)}</dd></span>
                      ))}
                    </dl>
                  </div>
                  <div className="review-section">
                    <h3>{t("prediction.maternalInformation")}</h3>
                    <dl className="review-grid">
                      {assessmentFieldSets[1].map((f) => (
                        <span key={f.key}><dt>{f.label}</dt><dd>{renderFieldValue(f)}</dd></span>
                      ))}
                    </dl>
                  </div>
                  <div className="review-section">
                    <h3>{t("prediction.householdEnvironment")}</h3>
                    <dl className="review-grid">
                      {assessmentFieldSets[2].map((f) => (
                        <span key={f.key}><dt>{f.label}</dt><dd>{renderFieldValue(f)}</dd></span>
                      ))}
                    </dl>
                  </div>
                  <div className="review-completeness">
                    {completeCount === totalPredictors ? (
                      <span className="completeness-ok">{"\u2713"} All required model inputs are complete ({completeCount}/{totalPredictors})</span>
                    ) : (
                      <span className="completeness-warn">{"\u26A0"} {completeCount}/{totalPredictors} complete {"\u2014"} {totalPredictors - completeCount} field(s) require attention</span>
                    )}
                  </div>
                </div>
              )}

              <div className="form-footer">
                {step > 0 && <button className="secondary-btn" onClick={() => setStep(step - 1)}>{t("prediction.back")}</button>}
                {step < 3 ? (
                  <button className="primary-btn" onClick={goNext}>{t("prediction.next")}</button>
                ) : (
                  <button className="primary-btn assess-btn" onClick={runAssessment} disabled={completeCount < totalPredictors || predictionAssess.isPending}>
                    {predictionAssess.isPending ? t("prediction.assessing") : t("prediction.runAssessment")}
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <div style={{ marginTop: "1rem", padding: "0 1.5rem 1.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <div className="input-icon" style={{ flex: 1 }}>
              <Search size={16} />
              <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLookup()} placeholder={t("prediction.trackPlaceholder")} />
            </div>
            <button className="secondary-btn" onClick={doLookup} disabled={lookupLoading}>{lookupLoading ? t("prediction.searching") : t("prediction.trackChild")}</button>
          </div>
          {lookupError && <div className="login-error" role="alert" style={{ marginTop: "0.5rem" }}>{lookupError}</div>}
        </div>
      </div>
    </Shell>
  );
}



const moduleConfig: any = {
  history: { title: "Prediction History", subtitle: "Search and review completed assessments", icon: <FileText />, description: "A searchable record of all predictions generated by nutrition officers." },
  reports: { title: "Reports", subtitle: "Generate and export operational insights", icon: <FileText />, description: "Create daily, weekly, monthly, high-risk, child-specific, officer, and model performance reports." },
  data: { title: "Data Management", subtitle: "Maintain structured nutrition records", icon: <Database />, description: "Manage child, maternal, household, and health/environment records with import and export tools." },
  model: { title: "Model Performance", subtitle: "Monitor prediction quality and model versions", icon: <BarChart3 />, description: "Review accuracy, precision, recall, F1 score, ROC-AUC, risk distribution, and confusion matrix." },
  users: { title: "Users", subtitle: "Manage roles and access", icon: <Users />, description: "Create, edit, activate, deactivate, and assign roles to system users." },
  settings: { title: "Settings", subtitle: "Configure the decision support system", icon: <Settings />, description: "Manage system identity, account, prediction thresholds, notifications, and security controls." },
  audit: { title: "Audit Logs", subtitle: "Track system and user activity", icon: <AlertTriangle />, description: "A read-only record of security-relevant actions: logins, registrations, approvals, status changes, and password resets." },
};

export function GenericModule({ type }: { type: keyof typeof moduleConfig }) {
  const c = moduleConfig[type];
  const { t } = useTranslation();
  const title = t(`routes.${String(type)}`);
  const subtitleKeys: Record<string, string> = { history: "searchReview", reports: "generateReports", data: "maintainRecords", model: "monitorModel", users: "manageAccess", settings: "configureSystem", audit: "trackActivity" };
  const subtitle = t(`routes.${subtitleKeys[String(type)]}`);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [reportFormat, setReportFormat] = useState<"pdf" | "csv" | "xlsx" | "print">("pdf");
  const reportCreate = trpc.reports.create.useMutation({
    onSuccess: () => { setSaved(true); toast.success("Report generated and saved."); },
    onError: () => toast.error("Unable to generate report."),
  });
  const queryInput = useMemo(() => ({ search: query }), [query]);
  const historyQuery = trpc.history.list.useQuery(queryInput, { enabled: type === "history" });
  const reportsQuery = trpc.reports.list.useQuery(undefined, { enabled: type === "reports" });
  const childrenQuery = trpc.data.children.useQuery(undefined, { enabled: type === "data" });
  const auditQuery = trpc.audit.list.useQuery(undefined, { enabled: type === "audit" });
  const serverRows = historyQuery.data?.length
    ? historyQuery.data.map((p: any) => ({
        id: p.predictionId,
        childId: String(p.childId),
        date: new Date(p.createdAt).toLocaleDateString(),
        level: p.riskLevel,
        prediction: p.prediction,
        probability: String(p.probability),
        officer: "Nutrition Officer",
      }))
    : [];
  const filtered = useMemo(() => sampleRows.filter((r) => Object.values(r).map(String).join(" ").toLowerCase().includes(query.toLowerCase())), [query]);
  const rows = type === "history" && serverRows.length ? serverRows : filtered;
  const pagedRows = rows.slice(page * 4, page * 4 + 4);
  const exportRows = () => {
    const csv = [
      "ID,Child ID,Date,Risk Level,Prediction,Probability,Officer",
      ...rows.map((r) => [r.id, r.childId, r.date, r.level, r.prediction, r.probability, r.officer].join(",")),
    ].join("\\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${String(type)}-export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV export downloaded.");
  };
  return (
    <Shell title={title} subtitle={subtitle}>
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">{t("dashboard.home")}</Link>
          <ChevronRight size={13} /> {title}
        </div>
        <section className="panel">
          {type === "reports" ? (
            <ReportsModule />
          ) : type === "model" ? (
            <ModelPerformance />
          ) : type === "users" ? (
            <UsersPanel />
          ) : type === "settings" ? (
            <SettingsPanel />
          ) : type === "audit" ? (
            <>
              <div className="panel-heading">
                <div><h2>{c.title}</h2><p>{c.description}</p></div>
              </div>
              {auditQuery.isLoading ? (
                <div className="module-state">Loading audit logs...</div>
              ) : auditQuery.isError ? (
                <div className="module-state error">Unable to load audit logs.</div>
              ) : !auditQuery.data?.length ? (
                <div className="module-state">No audit log entries yet.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr>
                    </thead>
                    <tbody>
                      {auditQuery.data.map((log: any) => (
                        <tr key={log.id}>
                          <td>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
                          <td>{log.userName ?? log.username ?? (log.userId ? `User #${log.userId}` : "System")}</td>
                          <td className="mono">{log.action}</td>
                          <td>{log.entity ?? "—"}</td>
                          <td className="mono">{log.entityId ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="panel-heading">
                <div><h2>{c.title}</h2><p>{c.description}</p></div>
                {type === "history" && (
                  <div className="export-actions">
                    <button className="secondary-btn" onClick={exportRows}><Download size={15} /> Export CSV</button>
                  </div>
                )}
              </div>
              <div className="module-controls">
                <div className="search-bar">
                  <Search size={16} />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${String(type)}...`} />
                </div>
              </div>
              {type === "history" && <Table rows={pagedRows} />}
              {type === "history" && rows.length > 4 && (
                <div className="pagination">
                  <button className="secondary-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <span>Page {page + 1} of {Math.ceil(rows.length / 4)}</span>
                  <button className="secondary-btn" disabled={(page + 1) * 4 >= rows.length} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              )}
              {type === "data" && <DataManagement />}
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

function ModelPanel() {
  const metrics = trpc.model.metrics.useQuery();
  if (metrics.isLoading) return <><section className="panel chart-panel"><div className="module-state">Loading risk-distribution data...</div></section><section className="panel confusion-panel"><div className="module-state">Loading confusion-matrix data...</div></section></>;
  if (metrics.isError || !metrics.data) return <><section className="panel chart-panel"><div className="module-state error">Unable to load risk-distribution data.</div></section><section className="panel confusion-panel"><div className="module-state error">Unable to load confusion-matrix data.</div></section></>;
  const m = metrics.data;
  const distribution = Array.isArray(m.riskDistribution) ? (m.riskDistribution as Array<{ label: string; value: number }>) : [];
  const matrix = Array.isArray(m.confusionMatrix) ? (m.confusionMatrix as Array<number>) : [];
  const maxDistribution = Math.max(1, ...distribution.map((item) => item.value));
  return (
    <>
      <div className="metric-grid">
        <StatCard icon={<Gauge size={20} />} color="#1c73e8" value={`${(m.accuracy * 100).toFixed(1)}%`} label="Accuracy" detail="current model" />
        <StatCard icon={<ShieldCheck size={20} />} color="#20a34a" value={`${(m.precision * 100).toFixed(1)}%`} label="Precision" detail="high-risk class" />
        <StatCard icon={<HeartPulse size={20} />} color="#f59b18" value={`${(m.recall * 100).toFixed(1)}%`} label="Recall" detail="high-risk class" />
        <StatCard icon={<BarChart3 size={20} />} color="#7651d6" value={`${(m.f1 * 100).toFixed(1)}%`} label="F1 Score" detail="macro average" />
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div><h2>Risk-class distribution</h2><p>Validation set &middot; Model {m.version}</p></div>
          <span className="model-tag">Last trained {m.lastTrained ? new Date(m.lastTrained).toLocaleDateString() : "Date unavailable"}</span>
        </div>
        {distribution.length ? (
          <div className="bars">
            {distribution.map((item) => (
              <div key={item.label} style={{ height: `${Math.max(8, (item.value / maxDistribution) * 100)}%` }}>
                <span>{item.label}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="module-state">No risk distribution data available.</div>
        )}
      </section>
      <section className="panel confusion-panel">
        <div className="panel-heading"><div><h2>Confusion matrix</h2><p>Model evaluation on test data</p></div></div>
        {matrix.length ? (
          <div className="confusion-matrix">
            {matrix.map((v, i) => (
              <div key={i} className="confusion-cell"><strong>{v}</strong></div>
            ))}
          </div>
        ) : (
          <div className="module-state">No confusion matrix data available.</div>
        )}
      </section>
    </>
  );
}

function SettingsPanel() {
  const settingsQuery = trpc.settings.list.useQuery();
  const settingsData = settingsQuery.data as Array<{ key: string; value: string }> | undefined;
  const settingsMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (settingsData) {
      for (const row of settingsData) {
        map[row.key] = row.value;
      }
    }
    return map;
  }, [settingsData]);

  const [threshold, setThreshold] = useState("0.60");
  const [systemName, setSystemName] = useState("Nutrition DSS");
  const [orgName, setOrgName] = useState("Community Nutrition Services");
  const [contact, setContact] = useState("support@nutrition-dss.org");
  const [modelVersion, setModelVersion] = useState("v2.4.1");
  const [alerts, setAlerts] = useState(true);
  const [reportNotifs, setReportNotifs] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settingsQuery.isSuccess && settingsData && !loaded) {
      if (settingsMap["highRiskThreshold"] !== undefined) setThreshold(settingsMap["highRiskThreshold"]);
      if (settingsMap["systemName"] !== undefined) setSystemName(settingsMap["systemName"]);
      if (settingsMap["organizationName"] !== undefined) setOrgName(settingsMap["organizationName"]);
      if (settingsMap["contactInfo"] !== undefined) setContact(settingsMap["contactInfo"]);
      if (settingsMap["modelVersion"] !== undefined) setModelVersion(settingsMap["modelVersion"]);
      if (settingsMap["predictionAlertsEnabled"] !== undefined) setAlerts(settingsMap["predictionAlertsEnabled"] === "true");
      if (settingsMap["reportNotificationsEnabled"] !== undefined) setReportNotifs(settingsMap["reportNotificationsEnabled"] === "true");
      setLoaded(true);
    }
  }, [settingsQuery.isSuccess, settingsData, loaded, settingsMap]);

  const save = trpc.settings.save.useMutation({
    onSuccess: () => {},
    onError: () => toast.error("Only administrators can save system settings."),
  });

  const saveSystemSettings = async () => {
    const keys = [
      { key: "systemName", value: systemName, auditAction: "settings.system_updated" },
      { key: "organizationName", value: orgName, auditAction: "settings.system_updated" },
      { key: "contactInfo", value: contact, auditAction: "settings.system_updated" },
    ];
    try {
      for (const k of keys) {
        await save.mutateAsync(k);
      }
      toast.success("System settings saved.");
    } catch { /* toast shown by onError */ }
  };

  const savePredictionSettings = async () => {
    const keys = [
      { key: "highRiskThreshold", value: threshold, auditAction: "settings.prediction_updated" },
      { key: "modelVersion", value: modelVersion, auditAction: "settings.prediction_updated" },
    ];
    try {
      for (const k of keys) {
        await save.mutateAsync(k);
      }
      toast.success("Prediction settings saved.");
    } catch { /* toast shown by onError */ }
  };

  const saveNotificationSettings = async () => {
    const keys = [
      { key: "predictionAlertsEnabled", value: String(alerts), auditAction: "settings.notifications_updated" },
      { key: "reportNotificationsEnabled", value: String(reportNotifs), auditAction: "settings.notifications_updated" },
    ];
    try {
      for (const k of keys) {
        await save.mutateAsync(k);
      }
      toast.success("Notification settings saved.");
    } catch { /* toast shown by onError */ }
  };

  if (settingsQuery.isLoading) return <section className="panel"><div className="module-state">Loading system settings...</div></section>;
  return (
    <section className="panel settings-grid">
      <div>
        <h3>System Settings</h3>
        <label>System name<input value={systemName} onChange={(e) => setSystemName(e.target.value)} /></label>
        <label>Organization name<input value={orgName} onChange={(e) => setOrgName(e.target.value)} /></label>
        <label>Contact information<input value={contact} onChange={(e) => setContact(e.target.value)} /></label>
        <button className="primary-btn" onClick={saveSystemSettings} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save system settings"}</button>
      </div>
      <div>
        <h3>Prediction Settings</h3>
        <label>Model version<select value={modelVersion} onChange={(e) => setModelVersion(e.target.value)}><option>v2.4.1</option><option>v2.3.0</option></select></label>
        <label>High-risk threshold<input value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <button className="primary-btn" onClick={savePredictionSettings} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save prediction settings"}</button>
        <h3>Notification Settings</h3>
        <label className="switch-row"><input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /> Prediction alerts</label>
        <label className="switch-row"><input type="checkbox" checked={reportNotifs} onChange={(e) => setReportNotifs(e.target.checked)} /> Report notifications</label>
        <button className="primary-btn" onClick={saveNotificationSettings} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save notification settings"}</button>
      </div>
    </section>
  );
}

export default Home;
