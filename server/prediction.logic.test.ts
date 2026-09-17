import { describe, expect, it } from "vitest";
import { assessmentFromProbability, recommendationsForRisk, buildDssRecommendations, PREDICTOR_DEFINITIONS } from "./prediction.logic";

describe("prediction risk assessment", () => {
  it("classifies high probability as elevated risk", () => {
    const result = assessmentFromProbability(0.87, 0.53);
    expect(result.risk).toBe("HIGH RISK");
    expect(result.prediction).toBe("Elevated Risk");
    expect(result.probability).toBe(0.87);
    expect(result.riskScore).toBe(87);
    expect(recommendationsForRisk(result.risk)).toHaveLength(5);
  });

  it("classifies low probability as normal range", () => {
    const result = assessmentFromProbability(0.24, 0.53);
    expect(result.risk).toBe("LOW RISK");
    expect(result.prediction).toBe("Normal Range");
    expect(result.probability).toBe(0.24);
    expect(result.riskScore).toBe(24);
    expect(recommendationsForRisk(result.risk)).toHaveLength(3);
  });

  it("classifies borderline probability as moderate risk", () => {
    const result = assessmentFromProbability(0.50, 0.53);
    expect(result.risk).toBe("MODERATE RISK");
    expect(result.prediction).toBe("Borderline Risk");
    expect(result.probability).toBe(0.50);
    expect(result.riskScore).toBe(50);
    expect(recommendationsForRisk(result.risk)).toHaveLength(4);
  });

  it("uses correct thresholds", () => {
    const stuntingHigh = assessmentFromProbability(0.54, 0.53);
    expect(stuntingHigh.risk).toBe("HIGH RISK");

    const stuntingModerate = assessmentFromProbability(0.52, 0.53);
    expect(stuntingModerate.risk).toBe("MODERATE RISK");

    const stuntingLow = assessmentFromProbability(0.24, 0.53);
    expect(stuntingLow.risk).toBe("LOW RISK");

    const underweightHigh = assessmentFromProbability(0.52, 0.51);
    expect(underweightHigh.risk).toBe("HIGH RISK");

    const underweightModerate = assessmentFromProbability(0.50, 0.51);
    expect(underweightModerate.risk).toBe("MODERATE RISK");

    const underweightLow = assessmentFromProbability(0.20, 0.51);
    expect(underweightLow.risk).toBe("LOW RISK");
  });
});

describe("DSS recommendations", () => {
  it("returns stunting recommendations when stunting is positive", () => {
    const recs = buildDssRecommendations(true, false);
    expect(recs.stunting.length).toBeGreaterThan(0);
    expect(recs.underweight).toHaveLength(0);
    expect(recs.general).toHaveLength(0);
  });

  it("returns underweight recommendations when underweight is positive", () => {
    const recs = buildDssRecommendations(false, true);
    expect(recs.stunting).toHaveLength(0);
    expect(recs.underweight.length).toBeGreaterThan(0);
    expect(recs.general).toHaveLength(0);
  });

  it("returns general recommendations when both are negative", () => {
    const recs = buildDssRecommendations(false, false);
    expect(recs.stunting).toHaveLength(0);
    expect(recs.underweight).toHaveLength(0);
    expect(recs.general.length).toBeGreaterThan(0);
  });

  it("returns both when both are positive", () => {
    const recs = buildDssRecommendations(true, true);
    expect(recs.stunting.length).toBeGreaterThan(0);
    expect(recs.underweight.length).toBeGreaterThan(0);
    expect(recs.general).toHaveLength(0);
  });
});

describe("predictor definitions", () => {
  it("defines 17 predictors", () => {
    const total = PREDICTOR_DEFINITIONS.numeric.length + PREDICTOR_DEFINITIONS.categorical.length;
    expect(total).toBe(17);
  });

  it("has 7 numeric predictors", () => {
    expect(PREDICTOR_DEFINITIONS.numeric).toHaveLength(7);
    const names = PREDICTOR_DEFINITIONS.numeric.map((p) => p.name);
    expect(names).toContain("CAGE");
    expect(names).toContain("WB4");
    expect(names).toContain("WAGEM");
    expect(names).toContain("CEB");
    expect(names).toContain("CSURV");
    expect(names).toContain("CDEAD");
    expect(names).toContain("CM11");
  });

  it("has 10 categorical predictors", () => {
    expect(PREDICTOR_DEFINITIONS.categorical).toHaveLength(10);
    const names = PREDICTOR_DEFINITIONS.categorical.map((p) => p.name);
    expect(names).toContain("HL4");
    expect(names).toContain("HH6");
    expect(names).toContain("windex5");
    expect(names).toContain("WS1");
    expect(names).toContain("WS11");
    expect(names).toContain("WS15");
    expect(names).toContain("welevel");
    expect(names).toContain("MSTATUS");
    expect(names).toContain("CM17");
    expect(names).toContain("insurance");
  });
});
