import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "nutrition_officer" | "data_manager" = "nutrition_officer"): TrpcContext {
  const now = new Date();
  return { user: { id: 1, openId: "router-test", email: "test@example.com", name: "Test Officer", loginMethod: "test", role, status: "active", createdAt: now, updatedAt: now, lastSignedIn: now }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

const validMicsInput = {
  childId: "CH-TEST-1",
  CAGE: "24",
  WB4: "28",
  WAGEM: "16",
  CEB: "4",
  CSURV: "3",
  CDEAD: "1",
  CM11: "4",
  HL4: "Masculin",
  HH6: "Rural",
  windex5: "Pauvre",
  WS1: "PUITS A POMPE/FORAGE",
  WS11: "LATRINE A FOSSE: SANS DALLE/FOSSE OUVERTE",
  WS15: "OUI",
  welevel: "Fondamental 1",
  MSTATUS: "Actuellement mariée/ou en union",
  CM17: "Au moins une naissance vivante dans les 2 dernières années",
  insurance: "Sans assurance",
};

describe("feature router contracts", () => {
  it("returns a typed prediction assessment with dual outcomes", async () => {
    const result = await appRouter.createCaller(context()).prediction.assess(validMicsInput);
    expect(result.predictions.stunting).toBeDefined();
    expect(result.predictions.underweight).toBeDefined();
    expect(typeof result.predictions.stunting.probability).toBe("number");
    expect(typeof result.predictions.underweight.probability).toBe("number");
    expect(result.predictions.stunting.threshold).toBe(0.53);
    expect(result.predictions.underweight.threshold).toBe(0.51);
    expect(result.model_info).toBeDefined();
    expect(result.model_info.algorithm).toBe("XGBoost");
    expect(result.combinedRisk).toMatch(/^(HIGH RISK|LOW RISK)$/);
    expect(result.recommendations).toBeDefined();
    expect(result.recommendations.stunting.length + result.recommendations.underweight.length + result.recommendations.general.length).toBeGreaterThan(0);
  }, 20000);

  it("rejects assess with missing predictors", async () => {
    await expect(
      appRouter.createCaller(context()).prediction.assess({ childId: "CH-TEST-2" } as any)
    ).rejects.toThrow();
  });

  it("exposes protected history download and rejects non-admin deletion", async () => {
    const caller = appRouter.createCaller(context());
    const download = await caller.history.download({ predictionId: "PRD-MISSING" });
    expect(download.format).toBe("csv");
    await expect(caller.history.delete({ predictionId: "PRD-MISSING" })).rejects.toThrow("You do not have required permission");
  });

  it("exposes normalized maternal, household, and health/environment CRUD contracts", async () => {
    const caller = appRouter.createCaller(context());
    expect(caller.data.maternal).toBeTypeOf("function");
    expect(caller.data.updateMaternal).toBeTypeOf("function");
    expect(caller.data.deleteMaternal).toBeTypeOf("function");
    expect(caller.data.household).toBeTypeOf("function");
    expect(caller.data.updateHousehold).toBeTypeOf("function");
    expect(caller.data.deleteHousehold).toBeTypeOf("function");
    expect(caller.data.healthEnvironment).toBeTypeOf("function");
    expect(caller.data.updateHealthEnvironment).toBeTypeOf("function");
    expect(caller.data.deleteHealthEnvironment).toBeTypeOf("function");
  });

  it("returns report metadata and rejects non-admin settings writes", async () => {
    const caller = appRouter.createCaller(context());
    const report = await caller.reports.create({ reportType: "high-risk", format: "pdf" });
    expect(report.status).toBe("ready");
    await expect(caller.settings.save({ key: "threshold", value: "11.5" })).rejects.toThrow("You do not have required permission");
  });
});
