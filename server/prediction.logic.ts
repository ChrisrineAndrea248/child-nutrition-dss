import { spawn } from "child_process";
import path from "path";

const PYTHON_SCRIPT = path.join(__dirname, "predict.py");

export type PredictionOutcome = {
  probability: number;
  threshold: number;
  positive: boolean;
  classification: string;
  interpretation: string;
};

export type FeatureImportanceEntry = { variable: string; importance: number };

export type DssPredictionResult = {
  success: boolean;
  predictions?: {
    stunting: PredictionOutcome;
    underweight: PredictionOutcome;
  };
  model_info?: {
    data_source: string;
    country: string;
    algorithm: string;
    outcomes: string[];
    purpose: string;
    stunting_threshold: number;
    underweight_threshold: number;
  };
  feature_importance?: {
    stunting: FeatureImportanceEntry[];
    underweight: FeatureImportanceEntry[];
  };
  error?: string;
  errors?: string[];
};

export type RiskAssessment = {
  probability: number;
  riskScore: number;
  risk: "HIGH RISK" | "MODERATE RISK" | "LOW RISK";
  prediction: "Elevated Risk" | "Borderline Risk" | "Normal Range";
};

export const PREDICTOR_DEFINITIONS = {
  numeric: [
    { name: "CAGE", label: "Child Age (months)", min: 0, max: 120 },
    { name: "WB4", label: "Child Weight (kg)", min: 0, max: 80 },
    { name: "WAGEM", label: "Mother's Age (years)", min: 10, max: 65 },
    { name: "CEB", label: "Children Ever Born", min: 0, max: 20 },
    { name: "CSURV", label: "Children Surviving", min: 0, max: 20 },
    { name: "CDEAD", label: "Children Dead", min: 0, max: 15 },
    { name: "CM11", label: "Birth Interval (months)", min: 0, max: 120 },
  ],
  categorical: [
    {
      name: "HL4",
      label: "Child Sex",
      options: ["Masculin", "Féminin"],
    },
    {
      name: "HH6",
      label: "Place of Residence",
      options: ["Rural", "Urbain"],
    },
    {
      name: "windex5",
      label: "Wealth Index",
      options: [
        "Le plus pauvre",
        "Le plus riche",
        "Pauvre",
        "Moyen",
        "Riche",
      ],
    },
    {
      name: "WS1",
      label: "Drinking Water Source",
      options: [
        "PUITS A POMPE/FORAGE",
        "SOURCE: SOURCE NON PROTEGEE",
        "PUITS CREUSE: PAS PROTEGE",
        "ROBINET: ROBIENT PUBLIC/BORNE FONTAINE",
        "PUITS CREUSE: PROTEGE",
        "EAU DE SURFACE (RIVIERE, BARRAGE, LAC, MARE, COURANT, CANAL, SYSTEME D'IRRIGATION)",
        "SOURCE: SOURCE PROTEGEE",
        "ROBINET: CHEZ LE VOISIN",
        "ROBINET: DANS LA CONCESSION/JARDIN/PARCELLE",
        "ROBINET: DANS LE LOGEMENT",
        "KIOSQUE A EAU",
        "CAMION CITERNE",
        "EAU DE PLUIE",
        "EAU CONDITIONNEE: EAU EN SACHET",
        "AUTRE",
        "CHARRETTE AVEC PETITE CITERNE",
      ],
    },
    {
      name: "WS11",
      label: "Type of Toilet Facility",
      options: [
        "LATRINE A FOSSE: SANS DALLE/FOSSE OUVERTE",
        "PAS DE TOILETTES/ NATURE/CHAMPS",
        "LATRINE A FOSSE: AVEC DALLE",
        "TOILETTE A COMPOSTAGE",
        "TOILETTES SUSPENDUES/LATRINES SUSPENDUES",
        "CHASSE D'EAU: RELIEE AUX LATRINES",
        "LATRINE A FOSSE: AMELIOREE VENTILEE",
        "CHASSE D'EAU: RELIEE A FOSSE SCEPTIQUE",
        "CHASSE D'EAU: RELIEE A SYSTEME D'EGOUTS",
        "CHASSE D'EAU: RELIEE A L'AIR LIBRE",
        "AUTRE",
        "CHASSE D'EAU: RELIEE A LIEU INCONNU",
      ],
    },
    {
      name: "WS15",
      label: "Water Treatment",
      options: ["OUI", "NON"],
    },
    {
      name: "welevel",
      label: "Education Level",
      options: [
        "Préscolaire ou aucun",
        "Fondamental 1",
        "Fondamental 2",
        "Secondaire ou plus",
      ],
    },
    {
      name: "MSTATUS",
      label: "Marital Status",
      options: [
        "Actuellement mariée/ou en union",
        "Formellement mariée /ou en union",
        "Jamais mariée /en union",
      ],
    },
    {
      name: "CM17",
      label: "Recent Live Births",
      options: [
        "Au moins une naissance vivante dans les 2 dernières années",
        "Pas de naissances vivantes dans les 2 dernières années",
      ],
    },
    {
      name: "insurance",
      label: "Health Insurance",
      options: ["Sans assurance", "Avec assurance"],
    },
  ],
};

export async function runPrediction(input: Record<string, unknown>): Promise<DssPredictionResult> {
  const payload = JSON.stringify({ input });

  return new Promise((resolve) => {
    const proc = spawn("py", [PYTHON_SCRIPT], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      if (stderr.trim()) {
        console.error("[Prediction] Python stderr:", stderr.trim());
      }
      try {
        const result: DssPredictionResult = JSON.parse(stdout.trim());
        resolve(result);
      } catch (err: any) {
        console.error("[Prediction] Parse error:", err.message, "stdout:", stdout);
        resolve({ success: false, error: `Failed to parse prediction output: ${err.message}` });
      }
    });

    proc.on("error", (err) => {
      console.error("[Prediction] Process error:", err.message);
      resolve({ success: false, error: `Prediction service error: ${err.message}` });
    });

    proc.stdin.write(payload);
    proc.stdin.end();
  });
}

export function buildDssRecommendations(
  stuntingPositive: boolean,
  underweightPositive: boolean
): { stunting: string[]; underweight: string[]; general: string[] } {
  const stunting: string[] = [];
  const underweight: string[] = [];
  const general: string[] = [];

  if (stuntingPositive) {
    stunting.push("Recommend comprehensive nutritional assessment.");
    stunting.push("Recommend regular growth monitoring and anthropometric follow-up.");
    stunting.push("Consider assessment of feeding practices, household factors, and environmental conditions.");
    stunting.push("Recommend appropriate professional follow-up with a nutrition specialist or healthcare provider.");
  }

  if (underweightPositive) {
    underweight.push("Recommend nutritional assessment focusing on dietary intake.");
    underweight.push("Recommend growth monitoring with regular weight checks.");
    underweight.push("Consider dietary and feeding assessment to identify potential deficiencies.");
    underweight.push("Recommend appropriate professional follow-up for nutritional support.");
  }

  if (!stuntingPositive && !underweightPositive) {
    general.push("Recommend continued routine growth monitoring.");
    general.push("Maintain age-appropriate feeding practices.");
    general.push("Reassess if illness or feeding concerns arise.");
  }

  return { stunting, underweight, general };
}

export function assessmentFromProbability(probability: number, threshold: number): RiskAssessment {
  const positive = probability >= threshold;
  const moderateMargin = threshold * 0.85;
  const moderate = !positive && probability >= moderateMargin;
  return {
    probability,
    riskScore: Math.round(probability * 100),
    risk: positive ? "HIGH RISK" : moderate ? "MODERATE RISK" : "LOW RISK",
    prediction: positive ? "Elevated Risk" : moderate ? "Borderline Risk" : "Normal Range",
  };
}

export function recommendationsForRisk(risk: RiskAssessment["risk"]): string[] {
  if (risk === "HIGH RISK") {
    return [
      "Provide nutrition-rich complementary foods.",
      "Ensure regular growth monitoring.",
      "Consider nutrition counseling for appropriate feeding.",
      "Ensure a healthcare professional review.",
      "Ensure proper hygiene and sanitation practices.",
    ];
  }
  if (risk === "MODERATE RISK") {
    return [
      "Monitor growth closely over the next 2 weeks.",
      "Provide nutrition counseling for appropriate feeding.",
      "Ensure regular follow-up visits.",
      "Consider supplementary feeding if growth falters.",
    ];
  }
  return [
    "Continue age-appropriate complementary feeding.",
    "Maintain regular growth monitoring.",
    "Reassess if illness or feeding concerns arise.",
  ];
}
