import { useMemo, useState } from "react";
import { Check, Download, Info, Search, ShieldCheck, Trash2, UserRound, UserCheck, UserX, ShieldOff, ShieldAlert, RotateCcw, Mail, Pencil } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getPermissionSummary, type Role } from "@shared/permissions";
import { validateFullName, validateUsername, validateEmail, validatePassword, validateConfirmPassword, type AccountStatus } from "@shared/validation";
import { useAuth } from "../_core/hooks/useAuth";
import ConfirmDialog from "./ConfirmDialog";

const ROLES = ["admin", "nutrition_officer", "data_manager"] as const;
const STATUSES: AccountStatus[] = ["pending", "active", "inactive", "suspended", "rejected"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  nutrition_officer: "Nutrition Officer",
  data_manager: "Data Manager",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  rejected: "Rejected",
};

type StatusAction = "approve" | "reject" | "suspend" | "deactivate" | "reactivate" | "activate";

const CONFIRM_COPY: Record<StatusAction, { title: string; description: (name: string) => string; confirmLabel: string; destructive?: boolean }> = {
  approve: { title: "Approve user", description: (n) => `Approve ${n}'s account? They will be able to sign in immediately.`, confirmLabel: "Approve" },
  reject: { title: "Reject user", description: (n) => `Reject ${n}'s registration? They will not be able to sign in.`, confirmLabel: "Reject", destructive: true },
  suspend: { title: "Suspend user", description: (n) => `Are you sure you want to suspend ${n}? They will be signed out and unable to log in until reactivated.`, confirmLabel: "Suspend", destructive: true },
  deactivate: { title: "Deactivate user", description: (n) => `Deactivate ${n}'s account? They will be unable to log in until reactivated.`, confirmLabel: "Deactivate", destructive: true },
  reactivate: { title: "Reactivate user", description: (n) => `Reactivate ${n}'s account? They will be able to log in again.`, confirmLabel: "Reactivate" },
  activate: { title: "Activate user", description: (n) => `Activate ${n}'s account? They will be able to log in again.`, confirmLabel: "Activate" },
};

function initials(value: string): string {
  return value
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function RoleBadge({ role }: { role: string }) {
  const cls = role === "admin" ? "admin" : role === "nutrition_officer" ? "officer" : "data";
  return <span className={`role-badge ${cls}`}>{ROLE_LABELS[role] ?? role.replace(/_/g, " ")}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-toggle ${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function PermissionSummary({ role }: { role: string }) {
  const summary = getPermissionSummary(role as Role);
  return (
    <div className="permission-summary">
      <div className="permission-summary-header">
        <Info size={13} /> Permissions for {ROLE_LABELS[role] ?? role.replace(/_/g, " ")}
      </div>
      <div className="permission-columns">
        <div className="permission-col granted">
          <div className="permission-col-title">Granted</div>
          {summary.granted.map((p) => (
            <div key={p} className="permission-item granted">{p}</div>
          ))}
        </div>
        {summary.restricted.length > 0 && (
          <div className="permission-col restricted">
            <div className="permission-col-title">Restricted</div>
            {summary.restricted.map((p) => (
              <div key={p} className="permission-item restricted">{p}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UsersPanel() {
  const { user: currentUser } = useAuth();
  const utils = trpc.useUtils();
  const users = trpc.users.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({ username: "", password: "", confirmPassword: "", name: "", email: "", role: "nutrition_officer" as string });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [resetFor, setResetFor] = useState<{ id: number; name: string } | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [deleteFor, setDeleteFor] = useState<{ id: number; name: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: StatusAction; id: number; name: string } | null>(null);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [confirmRole, setConfirmRole] = useState<{ id: number; name: string; currentRole: string; newRole: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState<{ id: number; email: string } | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [editEmailError, setEditEmailError] = useState("");

  const invalidate = () => utils.users.list.invalidate();

  const addUser = trpc.users.create.useMutation({
    onSuccess: (r) => {
      toast.success(r.message || "User created successfully.");
      setShowAdd(false);
      setConfirmAdd(false);
      setForm({ username: "", password: "", confirmPassword: "", name: "", email: "", role: "nutrition_officer" });
      setFormErrors({});
      invalidate();
    },
    onError: (e) => toast.error(e.message || "Unable to create user. Please try again."),
  });
  const setRole = trpc.users.updateRole.useMutation({
    onSuccess: (r) => { toast.success(r.message || "Role updated successfully."); setConfirmRole(null); invalidate(); },
    onError: (e) => { toast.error(e.message || "Unable to update role. Please try again."); setConfirmRole(null); },
  });
  const approveUser = trpc.users.approve.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to approve this user. Please try again.") });
  const rejectUser = trpc.users.reject.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to reject this user. Please try again.") });
  const suspendUser = trpc.users.suspend.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to suspend this user. Please try again.") });
  const deactivateUser = trpc.users.deactivate.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to deactivate this user. Please try again.") });
  const reactivateUser = trpc.users.reactivate.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to reactivate this user. Please try again.") });
  const activateUser = trpc.users.activate.useMutation({ onSuccess: (r) => { toast.success(r.message); invalidate(); }, onError: (e) => toast.error(e.message || "Unable to activate this user. Please try again.") });
  const resetPass = trpc.users.resetPassword.useMutation({
    onSuccess: (r) => { toast.success(r.message || "Password reset successfully."); setResetFor(null); setResetPw(""); },
    onError: (e) => toast.error(e.message || "Unable to reset password. Please try again."),
  });
  const delUser = trpc.users.delete.useMutation({
    onSuccess: (r) => { toast.success(r.message || "User deleted successfully."); setDeleteFor(null); invalidate(); },
    onError: (e) => toast.error(e.message || "Unable to delete user. Please try again."),
  });
  const updateEmail = trpc.users.updateEmail.useMutation({
    onSuccess: (r) => { toast.success(r.message || "Email updated successfully."); setEditingEmail(null); invalidate(); },
    onError: (e) => toast.error(e.message || "Unable to update email. Please try again."),
  });

  const statusActionRunners: Record<StatusAction, (id: number) => void> = {
    approve: (id) => approveUser.mutate({ id }),
    reject: (id) => rejectUser.mutate({ id }),
    suspend: (id) => suspendUser.mutate({ id }),
    deactivate: (id) => deactivateUser.mutate({ id }),
    reactivate: (id) => reactivateUser.mutate({ id }),
    activate: (id) => activateUser.mutate({ id }),
  };
  const anyStatusActionPending = approveUser.isPending || rejectUser.isPending || suspendUser.isPending || deactivateUser.isPending || reactivateUser.isPending || activateUser.isPending;

  const allRows = users.data ?? [];
  const stats = useMemo(
    () => ({
      total: allRows.length,
      pending: allRows.filter((u) => u.status === "pending").length,
      active: allRows.filter((u) => u.status === "active").length,
      inactive: allRows.filter((u) => u.status === "inactive").length,
      suspended: allRows.filter((u) => u.status === "suspended").length,
    }),
    [allRows]
  );

  const rows = allRows.filter((u) => {
    const matchesQuery = [u.name, u.username, u.email, u.role].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesStatus = statusFilter === "all" || u.status === statusFilter;
    return matchesQuery && matchesRole && matchesStatus;
  });

  const downloadUsers = () => {
    const csv = [
      "Name,Username,Email,Role,Status,Title,Phone,Last signed in",
      ...allRows.map((u) =>
        [u.name ?? "", u.username ?? "", u.email ?? "", u.role, u.status, u.title ?? "", u.phone ?? "", u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleString() : ""].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users-export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Users exported as CSV.");
  };

  const validateAddForm = (): boolean => {
    const errors: Record<string, string> = {};
    const nameErr = validateFullName(form.name);
    if (nameErr) errors.name = nameErr;
    const userErr = validateUsername(form.username);
    if (userErr) errors.username = userErr;
    const emailErr = validateEmail(form.email);
    if (emailErr) errors.email = emailErr;
    const pwErr = validatePassword(form.password);
    if (pwErr) errors.password = pwErr;
    const confirmErr = validateConfirmPassword(form.password, form.confirmPassword);
    if (confirmErr) errors.confirmPassword = confirmErr;
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitAddUser = () => {
    if (!validateAddForm()) return;
    setConfirmAdd(true);
  };

  const confirmAddUser = () => {
    setConfirmAdd(false);
    addUser.mutate({ username: form.username.trim(), password: form.password, confirmPassword: form.confirmPassword, name: form.name.trim(), email: form.email.trim(), role: form.role as "nutrition_officer" | "data_manager" });
  };

  const handleRoleChange = (userId: number, currentName: string, currentRole: string, newRole: string) => {
    if (currentRole === newRole) return;
    setConfirmRole({ id: userId, name: currentName, currentRole: ROLE_LABELS[currentRole] || currentRole, newRole: ROLE_LABELS[newRole] || newRole });
  };

  // Which status actions make sense for a given account status (mirrors the
  // server-side state machine in shared/validation.ts STATUS_TRANSITIONS).
  // Excludes self-targeting destructive actions (suspend/deactivate on yourself).
  const actionsFor = (status: string, userId: number): StatusAction[] => {
    const isSelf = currentUser?.id === userId;
    switch (status) {
      case "pending": return ["approve", "reject"];
      case "active": return isSelf ? [] : ["suspend", "deactivate"];
      case "inactive": return ["reactivate"];
      case "suspended": return ["reactivate"];
      case "rejected": return [];
      default: return [];
    }
  };

  const actionIcon: Record<StatusAction, React.ReactNode> = {
    approve: <UserCheck size={13} />,
    reject: <UserX size={13} />,
    suspend: <ShieldOff size={13} />,
    deactivate: <ShieldAlert size={13} />,
    reactivate: <RotateCcw size={13} />,
    activate: <RotateCcw size={13} />,
  };

  return (
    <section className="panel">
      <div className="stats-row">
        <div className="stat-pill"><b>{stats.total}</b><span>Total Users</span></div>
        <div className="stat-pill pending"><b>{stats.pending}</b><span>Pending</span></div>
        <div className="stat-pill active"><b>{stats.active}</b><span>Active</span></div>
        <div className="stat-pill inactive"><b>{stats.inactive}</b><span>Inactive</span></div>
        <div className="stat-pill suspended"><b>{stats.suspended}</b><span>Suspended</span></div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input placeholder="Search users..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="role-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select className="role-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <div className="toolbar-actions">
          <button className="outline-btn" onClick={downloadUsers}><Download size={16} /> Export</button>
          <button className="primary-btn" onClick={() => setShowAdd(true)}><UserRound size={16} /> Add User</button>
        </div>
      </div>

      {users.isLoading ? (
        <div className="module-state">Loading users...</div>
      ) : users.isError ? (
        <div className="module-state error">{users.error?.data?.code === "FORBIDDEN" ? "You need administrator access to manage users." : "Unable to load users."}</div>
      ) : allRows.length === 0 ? (
        <div className="module-state">No users found.</div>
      ) : rows.length === 0 ? (
        <div className="module-state">No users match your search criteria.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>User</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Registered</th><th>Last signed in</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">{initials(u.name ?? u.username ?? "U")}</div>
                      <div><b>{u.name ?? "Unnamed user"}</b></div>
                    </div>
                  </td>
                  <td className="mono">{u.username ?? "—"}</td>
                  <td>
                    {editingEmail?.id === u.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="email"
                          value={editEmailValue}
                          onChange={(e) => { setEditEmailValue(e.target.value); setEditEmailError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const emailErr = validateEmail(editEmailValue);
                              if (emailErr) { setEditEmailError(emailErr); return; }
                              updateEmail.mutate({ id: u.id, email: editEmailValue.trim() });
                            }
                            if (e.key === "Escape") setEditingEmail(null);
                          }}
                          style={{ width: "160px", fontSize: "12px", padding: "2px 6px" }}
                          autoFocus
                        />
                        <button className="table-action" onClick={() => {
                          const emailErr = validateEmail(editEmailValue);
                          if (emailErr) { setEditEmailError(emailErr); return; }
                          updateEmail.mutate({ id: u.id, email: editEmailValue.trim() });
                        }} disabled={updateEmail.isPending}>Save</button>
                        <button className="table-action" onClick={() => setEditingEmail(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>{u.email ?? "—"}</span>
                        {u.email && (
                          <button
                            className="table-action"
                            style={{ padding: "2px", minWidth: "auto" }}
                            title="Edit email"
                            onClick={() => { setEditingEmail({ id: u.id, email: u.email ?? "" }); setEditEmailValue(u.email ?? ""); setEditEmailError(""); }}
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    )}
                    {editingEmail?.id === u.id && editEmailError && <span className="field-error-text" style={{ fontSize: "11px" }}>{editEmailError}</span>}
                  </td>
                  <td>
                    <select
                      className="role-select"
                      value={u.role}
                      disabled={currentUser?.id === u.id}
                      onChange={(e) => handleRoleChange(u.id, u.name ?? u.username ?? "user", u.role, e.target.value)}
                      aria-label="User role"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    <RoleBadge role={u.role} />
                  </td>
                  <td><StatusBadge status={u.status} /></td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                  <td>{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="table-actions">
                      {actionsFor(u.status, u.id).map((action) => (
                        <button
                          key={action}
                          className={`table-action ${CONFIRM_COPY[action].destructive ? "danger" : ""}`}
                          disabled={anyStatusActionPending}
                          title={CONFIRM_COPY[action].title}
                          onClick={() => setConfirmAction({ action, id: u.id, name: u.name ?? u.username ?? "this user" })}
                        >
                          {actionIcon[action]} {CONFIRM_COPY[action].confirmLabel}
                        </button>
                      ))}
                      <button className="table-action" onClick={() => { setResetFor({ id: u.id, name: u.name ?? u.username ?? "user" }); setResetPw(""); }}>Reset</button>
                      {currentUser?.id !== u.id && (
                        <button className="table-action danger" onClick={() => setDeleteFor({ id: u.id, name: u.name ?? u.username ?? "user" })}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card">
            <button className="dialog-close" onClick={() => setShowAdd(false)} aria-label="Close">✕</button>
            <h3>Add New User</h3>
            <p>Create an account. It's Active immediately — the user signs in with the username and password you set.</p>
            <div className="form-grid">
              <label>Full name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
                {formErrors.name && <span className="field-error-text">{formErrors.name}</span>}
              </label>
              <label>Username
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="jane.doe" />
                {formErrors.username && <span className="field-error-text">{formErrors.username}</span>}
              </label>
              <label>Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@nutrition-dss.org" />
                {formErrors.email && <span className="field-error-text">{formErrors.email}</span>}
              </label>
              <label>Password
                <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars, upper, lower, number, symbol" />
                {formErrors.password && <span className="field-error-text">{formErrors.password}</span>}
              </label>
              <label>Confirm password
                <input type="text" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Re-enter password" />
                {formErrors.confirmPassword && <span className="field-error-text">{formErrors.confirmPassword}</span>}
              </label>
              <label>Role
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.filter((r) => r !== "admin").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </label>
            </div>
            <PermissionSummary role={form.role} />
            <div className="dialog-actions">
              <button className="outline-btn" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="primary-btn" disabled={addUser.isPending} onClick={submitAddUser}>
                {addUser.isPending ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetFor && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setResetFor(null)}>
          <div className="modal-card">
            <button className="dialog-close" onClick={() => setResetFor(null)} aria-label="Close">✕</button>
            <h3>Reset password — {resetFor.name}</h3>
            <p>Set a new password for this user.</p>
            <label>New password<input type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="Min 8 chars, upper, lower, number, symbol" /></label>
            {resetPw && validatePassword(resetPw) && <span className="field-error-text">{validatePassword(resetPw)}</span>}
            <div className="dialog-actions">
              <button className="outline-btn" onClick={() => setResetFor(null)}>Cancel</button>
              <button className="primary-btn" disabled={resetPass.isPending || !!validatePassword(resetPw)} onClick={() => resetPass.mutate({ id: resetFor.id, password: resetPw })}>
                {resetPass.isPending ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFor && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setDeleteFor(null)}>
          <div className="modal-card">
            <button className="dialog-close" onClick={() => setDeleteFor(null)} aria-label="Close">✕</button>
            <h3>Delete user</h3>
            <p>Remove <b>{deleteFor.name}</b> from the system? This cannot be undone.</p>
            <div className="dialog-actions">
              <button className="outline-btn" onClick={() => setDeleteFor(null)}>Cancel</button>
              <button className="danger-btn" disabled={delUser.isPending} onClick={() => delUser.mutate({ id: deleteFor.id })}>
                {delUser.isPending ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction ? CONFIRM_COPY[confirmAction.action].title : ""}
        description={confirmAction ? CONFIRM_COPY[confirmAction.action].description(confirmAction.name) : ""}
        confirmLabel={confirmAction ? CONFIRM_COPY[confirmAction.action].confirmLabel : "Confirm"}
        destructive={confirmAction ? !!CONFIRM_COPY[confirmAction.action].destructive : false}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (!confirmAction) return;
          statusActionRunners[confirmAction.action](confirmAction.id);
          setConfirmAction(null);
        }}
      />

      <ConfirmDialog
        open={confirmAdd}
        title="Add new user"
        description={`Create a new ${ROLE_LABELS[form.role] ?? form.role} account for ${form.name || "this user"}? The account will be active immediately.`}
        confirmLabel="Create User"
        onCancel={() => setConfirmAdd(false)}
        onConfirm={confirmAddUser}
      />

      <ConfirmDialog
        open={!!confirmRole}
        title="Change user role"
        description={confirmRole ? `Change ${confirmRole.name}'s role from ${confirmRole.currentRole} to ${confirmRole.newRole}?` : ""}
        confirmLabel="Change Role"
        onCancel={() => setConfirmRole(null)}
        onConfirm={() => {
          if (!confirmRole) return;
          setRole.mutate({ id: confirmRole.id, role: confirmRole.newRole === "Administrator" ? "admin" : confirmRole.newRole === "Nutrition Officer" ? "nutrition_officer" : "data_manager" });
        }}
      />

      {allRows.length > 0 && (
        <div className="save-note"><Check size={16} /> {allRows.length} user account{allRows.length === 1 ? "" : "s"} in the system</div>
      )}
      <span className="sr-only"><ShieldCheck /></span>
    </section>
  );
}
