import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

type LocalRow = Record<string, any>;

interface LocalState {
  predictions: LocalRow[];
  children: LocalRow[];
  reports: LocalRow[];
  modelVersions: LocalRow[];
  maternalInformation: LocalRow[];
  householdInformation: LocalRow[];
  healthEnvironmentInformation: LocalRow[];
  settings: LocalRow[];
  auditLogs: LocalRow[];
  users: LocalRow[];
  passwordResetTokens: LocalRow[];
  passwordResetOtps: LocalRow[];
  notifications: LocalRow[];
  predictionSeq: number;
  childSeq: number;
  reportSeq: number;
  maternalSeq: number;
  householdSeq: number;
  healthEnvSeq: number;
  settingSeq: number;
  auditLogSeq: number;
  userSeq: number;
  passwordResetTokenSeq: number;
  passwordResetOtpSeq: number;
  notificationSeq: number;
}

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "store.json");

function daysAgo(n: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, (n * 17) % 60, 0, 0);
  return d.toISOString();
}

function seedState(): LocalState {
  const samples: Array<{
    childId: string;
    age: number;
    sex: string;
    weight: string;
    height: string;
    muac: string;
    pred: string;
    risk: "High" | "Moderate" | "Low";
    prob: string;
    score: number;
    officerId: number;
    daysAgo: number;
  }> = [
    { childId: "CH-2024-00785", age: 24, sex: "Female", weight: "8.4", height: "78.0", muac: "11.2", pred: "Moderate/Severe", risk: "High", prob: "0.87", score: 82, officerId: 3, daysAgo: 0 },
    { childId: "CH-2024-00784", age: 36, sex: "Male", weight: "11.2", height: "86.0", muac: "12.8", pred: "At Risk", risk: "Moderate", prob: "0.63", score: 58, officerId: 1, daysAgo: 0 },
    { childId: "CH-2024-00783", age: 12, sex: "Female", weight: "8.1", height: "70.0", muac: "13.5", pred: "Normal", risk: "Low", prob: "0.24", score: 22, officerId: 4, daysAgo: 1 },
    { childId: "CH-2024-00782", age: 60, sex: "Male", weight: "13.0", height: "95.0", muac: "14.0", pred: "Normal", risk: "Low", prob: "0.19", score: 17, officerId: 3, daysAgo: 1 },
    { childId: "CH-2024-00781", age: 18, sex: "Female", weight: "7.2", height: "72.0", muac: "10.8", pred: "Severe", risk: "High", prob: "0.91", score: 90, officerId: 1, daysAgo: 2 },
    { childId: "CH-2024-00780", age: 42, sex: "Male", weight: "10.5", height: "84.0", muac: "12.1", pred: "At Risk", risk: "Moderate", prob: "0.55", score: 51, officerId: 4, daysAgo: 2 },
    { childId: "CH-2024-00779", age: 9, sex: "Female", weight: "6.8", height: "66.0", muac: "12.4", pred: "Normal", risk: "Low", prob: "0.31", score: 28, officerId: 3, daysAgo: 3 },
    { childId: "CH-2024-00778", age: 30, sex: "Male", weight: "9.6", height: "80.0", muac: "11.9", pred: "Moderate/Severe", risk: "High", prob: "0.78", score: 74, officerId: 1, daysAgo: 3 },
    { childId: "CH-2024-00777", age: 15, sex: "Female", weight: "7.6", height: "71.0", muac: "13.0", pred: "At Risk", risk: "Moderate", prob: "0.58", score: 54, officerId: 4, daysAgo: 4 },
    { childId: "CH-2024-00776", age: 48, sex: "Male", weight: "12.1", height: "92.0", muac: "14.2", pred: "Normal", risk: "Low", prob: "0.15", score: 14, officerId: 3, daysAgo: 4 },
    { childId: "CH-2024-00775", age: 21, sex: "Female", weight: "7.9", height: "74.0", muac: "11.5", pred: "Moderate/Severe", risk: "High", prob: "0.83", score: 79, officerId: 1, daysAgo: 5 },
    { childId: "CH-2024-00774", age: 33, sex: "Male", weight: "10.8", height: "85.0", muac: "12.6", pred: "At Risk", risk: "Moderate", prob: "0.60", score: 56, officerId: 4, daysAgo: 5 },
    { childId: "CH-2024-00773", age: 6, sex: "Female", weight: "6.2", height: "63.0", muac: "12.9", pred: "Normal", risk: "Low", prob: "0.27", score: 25, officerId: 3, daysAgo: 6 },
    { childId: "CH-2024-00772", age: 54, sex: "Male", weight: "12.6", height: "94.0", muac: "13.8", pred: "Normal", risk: "Low", prob: "0.21", score: 20, officerId: 1, daysAgo: 6 },
  ];

  const children: LocalRow[] = [];
  const predictions: LocalRow[] = [];

  samples.forEach((s, index) => {
    const childIdInt = index + 1;
    children.push({
      id: childIdInt,
      childId: s.childId,
      ageMonths: s.age,
      sex: s.sex,
      weightKg: s.weight,
      heightCm: s.height,
      muacCm: s.muac,
      createdAt: daysAgo(s.daysAgo, 8 + (index % 3)),
      updatedAt: daysAgo(s.daysAgo, 8 + (index % 3)),
    });
    predictions.push({
      id: index + 1,
      predictionId: `PRD-${String(790 - index).padStart(4, "0")}`,
      childId: childIdInt,
      officerId: s.officerId,
      modelVersionId: 1,
      inputData: { childId: s.childId, ageMonths: s.age, sex: s.sex, weightKg: Number(s.weight), heightCm: Number(s.height), muacCm: Number(s.muac) },
      prediction: s.pred,
      riskLevel: s.risk,
      probability: s.prob,
      riskScore: s.score,
      recommendations: s.risk === "High" ? ["Refer for therapeutic feeding", "Weekly follow-up monitoring"] : s.risk === "Moderate" ? ["Supplement with micronutrients", "Reassess in 4 weeks"] : ["Continue current care", "Routine growth monitoring"],
      createdAt: daysAgo(s.daysAgo, 8 + (index % 3)),
    });
  });

  return {
    predictions,
    children,
    reports: [],
    modelVersions: [
      {
        id: 1,
        version: "v2.4.1",
        accuracy: "0.87",
        precision: "0.84",
        recall: "0.82",
        f1Score: "0.83",
        rocAuc: "0.91",
        trainingDataSize: 4800,
        testingDataSize: 1200,
        riskDistribution: [{ label: "High", value: 4 }, { label: "Moderate", value: 4 }, { label: "Low", value: 6 }],
        confusionMatrix: { tn: 982, fp: 87, fn: 101, tp: 923 },
        lastTrainedAt: daysAgo(3, 14),
        createdAt: daysAgo(3, 14),
      },
    ],
    maternalInformation: [],
    householdInformation: [],
    healthEnvironmentInformation: [],
    settings: [],
    auditLogs: [],
    users: [],
    passwordResetTokens: [],
    passwordResetOtps: [],
    notifications: [],
    predictionSeq: samples.length,
    childSeq: samples.length,
    reportSeq: 0,
    maternalSeq: 0,
    householdSeq: 0,
    healthEnvSeq: 0,
    settingSeq: 0,
    auditLogSeq: 0,
    userSeq: 0,
    passwordResetTokenSeq: 0,
    passwordResetOtpSeq: 0,
    notificationSeq: 0,
  };
}

let state: LocalState | null = null;

function getState(): LocalState {
  if (state) return state;
  if (existsSync(STORE_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(STORE_FILE, "utf8"));
      if (parsed && Array.isArray(parsed.predictions)) {
        state = {
          ...parsed,
          maternalInformation: Array.isArray(parsed.maternalInformation) ? parsed.maternalInformation : [],
          householdInformation: Array.isArray(parsed.householdInformation) ? parsed.householdInformation : [],
          healthEnvironmentInformation: Array.isArray(parsed.healthEnvironmentInformation) ? parsed.healthEnvironmentInformation : [],
          settings: Array.isArray(parsed.settings) ? parsed.settings : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          users: Array.isArray(parsed.users) ? parsed.users : [],
          passwordResetTokens: Array.isArray(parsed.passwordResetTokens) ? parsed.passwordResetTokens : [],
          passwordResetOtps: Array.isArray(parsed.passwordResetOtps) ? parsed.passwordResetOtps : [],
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          maternalSeq: typeof parsed.maternalSeq === "number" ? parsed.maternalSeq : 0,
          householdSeq: typeof parsed.householdSeq === "number" ? parsed.householdSeq : 0,
          healthEnvSeq: typeof parsed.healthEnvSeq === "number" ? parsed.healthEnvSeq : 0,
          settingSeq: typeof parsed.settingSeq === "number" ? parsed.settingSeq : 0,
          auditLogSeq: typeof parsed.auditLogSeq === "number" ? parsed.auditLogSeq : 0,
          userSeq: typeof parsed.userSeq === "number" ? parsed.userSeq : 0,
          passwordResetTokenSeq: typeof parsed.passwordResetTokenSeq === "number" ? parsed.passwordResetTokenSeq : 0,
          passwordResetOtpSeq: typeof parsed.passwordResetOtpSeq === "number" ? parsed.passwordResetOtpSeq : 0,
          notificationSeq: typeof parsed.notificationSeq === "number" ? parsed.notificationSeq : 0,
        };
      }
    } catch {
      state = null;
    }
  }
  if (!state) {
    state = seedState();
    save();
  }
  return state;
}

function save(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn("[LocalStore] Failed to persist:", error);
  }
}

// ─── Predictions ───────────────────────────────────────────────

export function localListPredictions(search?: string): LocalRow[] {
  const state = getState();
  const rows = state.predictions.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
  const resolved: LocalRow[] = rows.map((r) => {
    const child = state.children.find((c) => c.id === r.childId);
    return { ...r, childIdStr: child?.childId ?? String(r.childId) };
  });
  if (!search) return resolved;
  return resolved.filter((r) => String(r.predictionId).toLowerCase().includes(search.toLowerCase()));
}

export function localCreatePrediction(input: LocalRow): LocalRow {
  const s = getState();
  s.predictionSeq += 1;
  const row: LocalRow = {
    id: s.predictionSeq,
    predictionId: input.predictionId ?? `PRD-${Date.now()}`,
    childId: input.childId,
    officerId: input.officerId,
    modelVersionId: input.modelVersionId ?? 1,
    inputData: input.inputData ?? null,
    prediction: input.prediction,
    riskLevel: input.riskLevel,
    probability: String(input.probability),
    riskScore: input.riskScore ?? 0,
    stuntingProbability: input.stuntingProbability != null ? String(input.stuntingProbability) : null,
    stuntingThreshold: input.stuntingThreshold != null ? String(input.stuntingThreshold) : null,
    stuntingRiskScore: input.stuntingRiskScore ?? null,
    underweightProbability: input.underweightProbability != null ? String(input.underweightProbability) : null,
    underweightThreshold: input.underweightThreshold != null ? String(input.underweightThreshold) : null,
    underweightRiskScore: input.underweightRiskScore ?? null,
    combinedRisk: input.combinedRisk ?? null,
    recommendations: input.recommendations ?? null,
    featureImportance: input.featureImportance ?? null,
    createdAt: new Date().toISOString(),
  };
  s.predictions.unshift(row);
  save();
  return row;
}

export function localGetPrediction(predictionId: string): LocalRow | undefined {
  return getState().predictions.find((r) => r.predictionId === predictionId);
}

export function localDeletePrediction(predictionId: string): void {
  const s = getState();
  s.predictions = s.predictions.filter((r) => r.predictionId !== predictionId);
  save();
}

// ─── Children ──────────────────────────────────────────────────

export function localListChildren(): LocalRow[] {
  return getState().children.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
}

export function localGetChildByChildId(childId: string): LocalRow | undefined {
  return getState().children.find((c) => c.childId === childId);
}

export function localCreateChild(input: LocalRow): LocalRow {
  const s = getState();
  s.childSeq += 1;
  const row: LocalRow = {
    id: s.childSeq,
    childId: input.childId,
    ageMonths: input.ageMonths,
    sex: input.sex,
    weightKg: String(input.weightKg),
    heightCm: input.heightCm != null ? String(input.heightCm) : null,
    muacCm: input.muacCm != null ? String(input.muacCm) : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  s.children.unshift(row);
  save();
  return row;
}

export function localUpdateChild(childId: string, input: Record<string, unknown>): void {
  const s = getState();
  const idx = s.children.findIndex((c) => c.childId === childId);
  if (idx === -1) return;
  const existing = s.children[idx];
  const updated: LocalRow = { ...existing, updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(input)) {
    if (key === "id" || key === "childId" || key === "createdAt") continue;
    if (key === "weightKg" || key === "heightCm" || key === "muacCm") {
      updated[key] = value != null ? String(value) : null;
    } else {
      updated[key] = value;
    }
  }
  s.children[idx] = updated;
  save();
}

export function localDeleteChild(childId: string): void {
  const s = getState();
  s.children = s.children.filter((c) => c.childId !== childId);
  save();
}

// ─── Maternal Information ──────────────────────────────────────

export function localListMaternalInformation(childId?: number): LocalRow[] {
  const rows = getState().maternalInformation.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
  if (childId == null) return rows;
  return rows.filter((r) => r.childId === childId);
}

export function localSaveMaternalInformation(input: LocalRow): LocalRow {
  const s = getState();
  s.maternalSeq += 1;
  const row: LocalRow = {
    id: s.maternalSeq,
    childId: input.childId,
    data: input.data ?? {},
    createdAt: new Date().toISOString(),
  };
  s.maternalInformation.unshift(row);
  save();
  return row;
}

export function localUpdateMaternalInformation(id: number, data: unknown): void {
  const s = getState();
  const idx = s.maternalInformation.findIndex((r) => r.id === id);
  if (idx === -1) return;
  s.maternalInformation[idx] = { ...s.maternalInformation[idx], data };
  save();
}

export function localDeleteMaternalInformation(id: number): void {
  const s = getState();
  s.maternalInformation = s.maternalInformation.filter((r) => r.id !== id);
  save();
}

// ─── Household Information ─────────────────────────────────────

export function localListHouseholdInformation(childId?: number): LocalRow[] {
  const rows = getState().householdInformation.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
  if (childId == null) return rows;
  return rows.filter((r) => r.childId === childId);
}

export function localSaveHouseholdInformation(input: LocalRow): LocalRow {
  const s = getState();
  s.householdSeq += 1;
  const row: LocalRow = {
    id: s.householdSeq,
    childId: input.childId,
    data: input.data ?? {},
    createdAt: new Date().toISOString(),
  };
  s.householdInformation.unshift(row);
  save();
  return row;
}

export function localUpdateHouseholdInformation(id: number, data: unknown): void {
  const s = getState();
  const idx = s.householdInformation.findIndex((r) => r.id === id);
  if (idx === -1) return;
  s.householdInformation[idx] = { ...s.householdInformation[idx], data };
  save();
}

export function localDeleteHouseholdInformation(id: number): void {
  const s = getState();
  s.householdInformation = s.householdInformation.filter((r) => r.id !== id);
  save();
}

// ─── Health/Environment Information ────────────────────────────

export function localListHealthEnvironmentInformation(childId?: number): LocalRow[] {
  const rows = getState().healthEnvironmentInformation.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
  if (childId == null) return rows;
  return rows.filter((r) => r.childId === childId);
}

export function localSaveHealthEnvironmentInformation(input: LocalRow): LocalRow {
  const s = getState();
  s.healthEnvSeq += 1;
  const row: LocalRow = {
    id: s.healthEnvSeq,
    childId: input.childId,
    data: input.data ?? {},
    createdAt: new Date().toISOString(),
  };
  s.healthEnvironmentInformation.unshift(row);
  save();
  return row;
}

export function localUpdateHealthEnvironmentInformation(id: number, data: unknown): void {
  const s = getState();
  const idx = s.healthEnvironmentInformation.findIndex((r) => r.id === id);
  if (idx === -1) return;
  s.healthEnvironmentInformation[idx] = { ...s.healthEnvironmentInformation[idx], data };
  save();
}

export function localDeleteHealthEnvironmentInformation(id: number): void {
  const s = getState();
  s.healthEnvironmentInformation = s.healthEnvironmentInformation.filter((r) => r.id !== id);
  save();
}

// ─── Settings ──────────────────────────────────────────────────

export function localGetSettings(): LocalRow[] {
  return getState().settings.slice().sort((a, b) => (b.updatedAt as string).localeCompare(a.updatedAt as string));
}

export function localSaveSetting(key: string, value: string, updatedBy?: number): void {
  const s = getState();
  const existing = s.settings.find((r) => r.key === key);
  if (existing) {
    existing.value = value;
    existing.updatedBy = updatedBy ?? existing.updatedBy;
    existing.updatedAt = new Date().toISOString();
  } else {
    s.settingSeq += 1;
    s.settings.push({
      id: s.settingSeq,
      key,
      value,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date().toISOString(),
    });
  }
  save();
}

// ─── Audit Logs ────────────────────────────────────────────────

export function localCreateAuditLog(input: LocalRow): void {
  const s = getState();
  s.auditLogSeq += 1;
  const row: LocalRow = {
    id: s.auditLogSeq,
    userId: input.userId ?? null,
    action: input.action,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? null,
    createdAt: new Date().toISOString(),
  };
  s.auditLogs.unshift(row);
  save();
}

export function localListAuditLogs(): LocalRow[] {
  return getState().auditLogs.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
}

// ─── Reports ───────────────────────────────────────────────────

export function localListReports(): LocalRow[] {
  return getState().reports.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
}

export function localCreateReport(input: LocalRow): LocalRow {
  const s = getState();
  s.reportSeq += 1;
  const row: LocalRow = {
    id: s.reportSeq,
    reportType: input.reportType,
    generatedBy: input.generatedBy,
    format: input.format,
    fileUrl: null,
    createdAt: new Date().toISOString(),
  };
  s.reports.unshift(row);
  save();
  return row;
}

// ─── Model Versions ────────────────────────────────────────────

export function localGetLatestModelVersion(): LocalRow | undefined {
  return getState().modelVersions.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string))[0];
}

// ─── Users ─────────────────────────────────────────────────────

export function localListUsers(): LocalRow[] {
  return getState().users.slice().sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
}

export function localGetUserByOpenId(openId: string): LocalRow | undefined {
  return getState().users.find((u) => u.openId === openId);
}

export function localGetUserByUsername(username: string): LocalRow | undefined {
  const needle = username.toLowerCase();
  return getState().users.find((u) => String(u.username ?? "").toLowerCase() === needle);
}

export function localGetUserByEmail(email: string): LocalRow | undefined {
  const needle = email.toLowerCase();
  return getState().users.find((u) => String(u.email ?? "").toLowerCase() === needle);
}

export function localGetUserById(id: number): LocalRow | undefined {
  return getState().users.find((u) => u.id === id);
}

export function localCreateUser(input: LocalRow): LocalRow {
  const s = getState();
  s.userSeq += 1;
  const row: LocalRow = {
    id: s.userSeq,
    openId: input.openId,
    username: input.username,
    passwordHash: input.passwordHash,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    title: input.title ?? null,
    avatar: input.avatar ?? null,
    loginMethod: input.loginMethod ?? "local",
    role: input.role,
    status: input.status ?? "active",
    mustChangePassword: input.mustChangePassword ?? false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSignedIn: input.lastSignedIn ?? new Date().toISOString(),
    lastActiveAt: input.lastActiveAt ?? new Date().toISOString(),
  };
  s.users.push(row);
  save();
  return row;
}

export function localUpdateUser(id: number, updates: Record<string, unknown>): void {
  const s = getState();
  const idx = s.users.findIndex((u) => u.id === id);
  if (idx === -1) return;
  const existing = s.users[idx];
  const updated: LocalRow = { ...existing, updatedAt: new Date().toISOString() };
  for (const [key, value] of Object.entries(updates)) {
    if (key === "id" || key === "openId" || key === "createdAt") continue;
    updated[key] = value;
  }
  s.users[idx] = updated;
  save();
}

export function localDeleteUser(id: number): boolean {
  const s = getState();
  const before = s.users.length;
  s.users = s.users.filter((u) => u.id !== id);
  if (s.users.length < before) {
    save();
    return true;
  }
  return false;
}

// ─── Password reset tokens ────────────────────────────────────

export function localCreatePasswordResetToken(userId: number, tokenHash: string, expiresAt: string): LocalRow {
  const s = getState();
  s.passwordResetTokenSeq += 1;
  const row: LocalRow = { id: s.passwordResetTokenSeq, userId, tokenHash, expiresAt, usedAt: null, createdAt: new Date().toISOString() };
  s.passwordResetTokens.push(row);
  save();
  return row;
}

export function localGetPasswordResetTokenByHash(tokenHash: string): LocalRow | undefined {
  return getState().passwordResetTokens.find((t) => t.tokenHash === tokenHash);
}

export function localMarkPasswordResetTokenUsed(id: number): void {
  const s = getState();
  const idx = s.passwordResetTokens.findIndex((t) => t.id === id);
  if (idx === -1) return;
  s.passwordResetTokens[idx] = { ...s.passwordResetTokens[idx], usedAt: new Date().toISOString() };
  save();
}

// ─── Password reset OTPs ──────────────────────────────────────

export function localCreatePasswordResetOtp(userId: number, otpHash: string, expiresAt: string): LocalRow {
  const s = getState();
  s.passwordResetOtpSeq += 1;
  const row: LocalRow = { id: s.passwordResetOtpSeq, userId, otpHash, expiresAt, usedAt: null, verifiedAt: null, attempts: 0, resendCount: 0, createdAt: new Date().toISOString() };
  s.passwordResetOtps.push(row);
  save();
  return row;
}

export function localGetPasswordResetOtpById(id: number): LocalRow | undefined {
  return getState().passwordResetOtps.find((t) => t.id === id);
}

export function localGetPasswordResetOtpByHash(otpHash: string): LocalRow | undefined {
  return getState().passwordResetOtps.find((t) => t.otpHash === otpHash && !t.usedAt);
}

export function localGetActiveOtpForUser(userId: number): LocalRow | undefined {
  const now = Date.now();
  return getState().passwordResetOtps.find(
    (t) => t.userId === userId && !t.usedAt && new Date(t.expiresAt).getTime() > now
  );
}

export function localUpdatePasswordResetOtp(id: number, updates: Partial<LocalRow>): void {
  const s = getState();
  const idx = s.passwordResetOtps.findIndex((t) => t.id === id);
  if (idx === -1) return;
  s.passwordResetOtps[idx] = { ...s.passwordResetOtps[idx], ...updates };
  save();
}

export function localUpsertUser(input: LocalRow): void {
  const s = getState();
  const existing = s.users.find((u) => u.openId === input.openId);
  if (existing) {
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined && value !== null) {
        existing[key] = value;
      }
    }
    existing.updatedAt = new Date().toISOString();
    if (input.lastSignedIn) existing.lastSignedIn = input.lastSignedIn;
    if (input.lastActiveAt) existing.lastActiveAt = input.lastActiveAt;
    save();
  } else {
    s.userSeq += 1;
    s.users.push({
      id: s.userSeq,
      openId: input.openId,
      username: input.username ?? null,
      passwordHash: input.passwordHash ?? null,
      name: input.name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
      avatar: input.avatar ?? null,
      loginMethod: input.loginMethod ?? null,
      role: input.role ?? "nutrition_officer",
      status: input.status ?? "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSignedIn: input.lastSignedIn ?? new Date().toISOString(),
      lastActiveAt: input.lastActiveAt ?? new Date().toISOString(),
    });
    save();
  }
}

// ─── Notifications ─────────────────────────────────────────────

export function localCreateNotification(input: LocalRow): LocalRow {
  const s = getState();
  s.notificationSeq += 1;
  const row: LocalRow = {
    id: s.notificationSeq,
    userId: input.userId,
    title: input.title,
    message: input.message,
    type: input.type,
    entity: input.entity ?? null,
    entityId: input.entityId ?? null,
    link: input.link ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  s.notifications.unshift(row);
  save();
  return row;
}

export function localListNotifications(userId: number): LocalRow[] {
  return getState()
    .notifications.filter((n) => n.userId === userId)
    .sort((a, b) => (b.createdAt as string).localeCompare(a.createdAt as string));
}

export function localGetUnreadNotificationCount(userId: number): number {
  return getState().notifications.filter((n) => n.userId === userId && !n.read).length;
}

export function localMarkNotificationRead(id: number, userId: number): void {
  const s = getState();
  const idx = s.notifications.findIndex((n) => n.id === id && n.userId === userId);
  if (idx === -1) return;
  s.notifications[idx] = { ...s.notifications[idx], read: true };
  save();
}

export function localMarkAllNotificationsRead(userId: number): void {
  const s = getState();
  let changed = false;
  for (const n of s.notifications) {
    if (n.userId === userId && !n.read) {
      n.read = true;
      changed = true;
    }
  }
  if (changed) save();
}

// ─── Reset ─────────────────────────────────────────────────────

export function localStoreReset(): void {
  state = seedState();
  save();
}

// ─── Migration: re-pad narrow childId values to 5 digits ───────

export function localMigrateChildIdPadding(): number {
  const s = getState();
  const narrowPattern = /^CH-(\d{4})-(\d{1,2})$/;
  let migrated = 0;
  for (const child of s.children) {
    const match = String(child.childId).match(narrowPattern);
    if (match) {
      const year = match[1];
      const num = parseInt(match[2], 10);
      const newId = `CH-${year}-${String(num).padStart(5, "0")}`;
      if (newId !== child.childId) {
        child.childId = newId;
        child.updatedAt = new Date().toISOString();
        migrated++;
      }
    }
  }
  if (migrated > 0) save();
  return migrated;
}
