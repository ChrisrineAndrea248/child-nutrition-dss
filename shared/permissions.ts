// =============================================================================
// Centralized role-based access control (RBAC)
//
// Single source of truth for role permissions. Used by both frontend navigation
// filtering and backend authorization middleware.
// =============================================================================

export type Role = "admin" | "nutrition_officer" | "data_manager";

export type Permission =
  | "dashboard.view"
  | "prediction.create"
  | "prediction.view"
  | "history.view"
  | "history.delete"
  | "data.view"
  | "data.create"
  | "data.update"
  | "data.delete"
  | "reports.view"
  | "reports.create"
  | "model.view"
  | "users.view"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "settings.view"
  | "settings.update"
  | "audit.view";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    "dashboard.view",
    "prediction.create",
    "prediction.view",
    "history.view",
    "history.delete",
    "data.view",
    "data.create",
    "data.update",
    "data.delete",
    "reports.view",
    "reports.create",
    "model.view",
    "users.view",
    "users.create",
    "users.update",
    "users.delete",
    "settings.view",
    "settings.update",
    "audit.view",
  ],
  nutrition_officer: [
    "dashboard.view",
    "prediction.create",
    "prediction.view",
    "history.view",
    "data.view",
    "data.create",
    "data.update",
    "reports.view",
    "reports.create",
    "model.view",
  ],
  data_manager: [
    "dashboard.view",
    "prediction.view",
    "history.view",
    "data.view",
    "data.create",
    "data.update",
    "data.delete",
    "reports.view",
    "reports.create",
    "model.view",
    "audit.view",
  ],
} as const;

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return (perms as readonly Permission[]).includes(permission);
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

// Navigation items with required permission
export type NavItem = {
  label: string;
  path: string;
  icon: string;
  permission: Permission;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: "▦", permission: "dashboard.view" },
  { label: "New Prediction", path: "/prediction/new", icon: "✦", permission: "prediction.create" },
  { label: "Prediction History", path: "/history", icon: "◷", permission: "history.view" },
  { label: "Data Management", path: "/data", icon: "▣", permission: "data.view" },
  { label: "Reports", path: "/reports", icon: "▤", permission: "reports.view" },
  { label: "Model Performance", path: "/model", icon: "◒", permission: "model.view" },
  { label: "Users", path: "/users", icon: "♙", permission: "users.view" },
  { label: "Settings", path: "/settings", icon: "⚙", permission: "settings.view" },
  { label: "Audit Logs", path: "/audit", icon: "📋", permission: "audit.view" },
] as const;

export function getVisibleNavItems(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

// Permission summary for UI display
export type PermissionSummary = {
  granted: string[];
  restricted: string[];
};

const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard.view": "Dashboard",
  "prediction.create": "New Prediction",
  "prediction.view": "Prediction Viewing",
  "history.view": "Prediction History",
  "history.delete": "Delete Predictions",
  "data.view": "Data Viewing",
  "data.create": "Data Creation",
  "data.update": "Data Editing",
  "data.delete": "Delete Data Records",
  "reports.view": "Reports",
  "reports.create": "Create Reports",
  "model.view": "Model Performance",
  "users.view": "User Management",
  "users.create": "Create Users",
  "users.update": "Edit Users",
  "users.delete": "Delete Users",
  "settings.view": "System Settings",
  "settings.update": "Edit Settings",
  "audit.view": "Audit Logs",
};

export function getPermissionSummary(role: Role): PermissionSummary {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  const allPerms = Object.keys(PERMISSION_LABELS) as Permission[];
  return {
    granted: allPerms.filter((p) => (perms as readonly Permission[]).includes(p)).map((p) => PERMISSION_LABELS[p]),
    restricted: allPerms.filter((p) => !(perms as readonly Permission[]).includes(p)).map((p) => PERMISSION_LABELS[p]),
  };
}
