// =============================================================================
// Plain TypeScript types describing the database rows this app works with.
//
// These match the tables created directly via SQL (see mysql-setup.sql) —
// there is no ORM or migration tool generating these; they're just hand
// written to match the columns. Update both together if the schema changes.
// =============================================================================

export type UserRole = "admin" | "nutrition_officer" | "data_manager";
export type UserStatus = "pending" | "active" | "inactive" | "suspended" | "rejected";

export interface User {
  id: number;
  openId: string;
  username: string | null;
  passwordHash: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  avatar: string | null;
  loginMethod: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
  lastActiveAt: Date;
}

export interface InsertUser {
  openId: string;
  username?: string | null;
  passwordHash?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  avatar?: string | null;
  loginMethod?: string | null;
  role?: UserRole;
  status?: UserStatus;
  mustChangePassword?: boolean;
  lastSignedIn?: Date;
  lastActiveAt?: Date;
}
