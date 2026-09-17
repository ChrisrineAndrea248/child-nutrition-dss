import { useState, useRef, useEffect } from "react";
import { BarChart3, ChevronRight, Info, AlertTriangle } from "lucide-react";
import { Link, useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { getVisibleNavItems, type Role } from "@shared/permissions";

const MODEL_INFO = {
  data_source: "CAR MICS6",
  country: "Central African Republic",
  algorithm: "XGBoost",
  outcomes: ["Stunting (Height-for-Age)", "Underweight (Weight-for-Age)"],
  purpose: "Child undernutrition screening / decision support",
  num_predictors: 17,
  numeric_predictors: 7,
  categorical_predictors: 10,
};

const STUNTING_THRESHOLD = 0.53;
const UNDERWEIGHT_THRESHOLD = 0.51;

const STUNTING_TEST_METRICS = {
  accuracy: 0.6223,
  precision: 0.4516,
  recall: 0.6265,
  f1: 0.5249,
  rocAuc: 0.6752,
  prAuc: 0.4651,
  fpr: 0.3798,
  testSize: 1721,
  confusionMatrix: { tn: 712, fp: 436, fn: 214, tp: 359 },
};

const UNDERWEIGHT_TEST_METRICS = {
  accuracy: 0.5587,
  precision: 0.3248,
  recall: 0.6878,
  f1: 0.4412,
  rocAuc: 0.6546,
  prAuc: 0.3564,
  fpr: 0.4850,
  testSize: 1745,
  confusionMatrix: { tn: 671, fp: 632, fn: 138, tp: 304 },
};

const STUNTING_VALIDATION_METRICS = {
  accuracy: 0.7049,
  precision: 0.5414,
  recall: 0.7424,
  f1: 0.6262,
};

const UNDERWEIGHT_VALIDATION_METRICS = {
  accuracy: 0.5946,
  precision: 0.3597,
  recall: 0.7734,
  f1: 0.4910,
};

const STUNTING_FEATURE_IMPORTANCE = [
  { rank: 1, predictor: "HH6", label: "Place of Residence", importance: 0.1818 },
  { rank: 2, predictor: "windex5", label: "Wealth Index", importance: 0.1719 },
  { rank: 3, predictor: "WS1", label: "Drinking Water Source", importance: 0.1544 },
  { rank: 4, predictor: "welevel", label: "Education Level", importance: 0.1127 },
  { rank: 5, predictor: "WS11", label: "Type of Toilet Facility", importance: 0.0768 },
  { rank: 6, predictor: "CAGE", label: "Child Age (months)", importance: 0.0589 },
  { rank: 7, predictor: "CM17", label: "Recent Live Births", importance: 0.0418 },
  { rank: 8, predictor: "HL4", label: "Child Sex", importance: 0.0409 },
  { rank: 9, predictor: "MSTATUS", label: "Marital Status", importance: 0.0405 },
  { rank: 10, predictor: "WS15", label: "Water Treatment", importance: 0.0248 },
];

const UNDERWEIGHT_FEATURE_IMPORTANCE = [
  { rank: 1, predictor: "WS1", label: "Drinking Water Source", importance: 0.1771 },
  { rank: 2, predictor: "WS11", label: "Type of Toilet Facility", importance: 0.1302 },
  { rank: 3, predictor: "welevel", label: "Education Level", importance: 0.1277 },
  { rank: 4, predictor: "windex5", label: "Wealth Index", importance: 0.1225 },
  { rank: 5, predictor: "CAGE", label: "Child Age (months)", importance: 0.0745 },
  { rank: 6, predictor: "HH6", label: "Place of Residence", importance: 0.0627 },
  { rank: 7, predictor: "CM17", label: "Recent Live Births", importance: 0.0547 },
  { rank: 8, predictor: "MSTATUS", label: "Marital Status", importance: 0.0507 },
  { rank: 9, predictor: "HL4", label: "Child Sex", importance: 0.0458 },
  { rank: 10, predictor: "WS15", label: "Water Treatment", importance: 0.0289 },
];

function Shell({ children, title, subtitle, onLogout }: { children: React.ReactNode; title: string; subtitle?: string; onLogout?: () => void }) {
  const [loc, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);
  const role = (user?.role as Role) ?? "nutrition_officer";
  const visibleNavItems = getVisibleNavItems(role);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (v?: string | null) =>
    (v || "U").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><span style={{ fontSize: "18px" }}>&#9829;</span></div>
          <div><b>NUTRITION</b><span>DSS</span></div>
          <button className="close-nav" onClick={() => setOpen(false)}><span style={{ fontSize: "18px" }}>&times;</span></button>
        </div>
        <div className="nav-label">MAIN MENU</div>
        <nav>
          {visibleNavItems.map((item) => (
            <Link key={item.path} href={item.path} className={loc === item.path ? "nav-item active" : "nav-item"} onClick={() => setOpen(false)}>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setOpen(true)}><span style={{ fontSize: "21px" }}>&#9776;</span></button>
          <div className="topbar-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
          <div className="topbar-right">
            <span style={{ fontSize: "18px" }}>&#128276;</span>
            <div className="profile-menu" ref={menuRef}>
              <button className="profile-trigger" onClick={() => setProfileOpen((o) => !o)}>
                <span className="welcome">Welcome, {user?.name?.split(" ")[0] ?? "User"}</span>
                <div className="avatar">{user?.avatar ? <img src={user.avatar} alt="avatar" /> : initials(user?.name)}</div>
              </button>
              {profileOpen && (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-head">
                    <div className="avatar lg">{user?.avatar ? <img src={user.avatar} alt="avatar" /> : initials(user?.name)}</div>
                    <div><b>{user?.name ?? "User"}</b><span>{(user?.title || user?.role || "").replace(/_/g, " ")}</span></div>
                  </div>
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

function MetricCard({ label, value, detail, color }: { label: string; value: string; detail?: string; color?: string }) {
  return (
    <div style={{
      background: "white",
      border: "1px solid #e3e9f1",
      borderRadius: "8px",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    }}>
      <span style={{ fontSize: "10px", color: "#718096", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <span style={{ fontFamily: "Manrope", fontSize: "22px", fontWeight: 700, color: color || "#132238" }}>{value}</span>
      {detail && <span style={{ fontSize: "10px", color: "#718096" }}>{detail}</span>}
    </div>
  );
}

function ConfusionMatrix({ matrix, labels }: { matrix: { tn: number; fp: number; fn: number; tp: number }; labels: [string, string] }) {
  const max = Math.max(matrix.tn, matrix.fp, matrix.fn, matrix.tp, 1);
  const cellStyle = (value: number, bg: string) => ({
    width: "80px",
    height: "60px",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: bg,
    borderRadius: "6px",
    border: "1px solid #e3e9f1",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "4px", alignItems: "center" }}>
        <div />
        <div style={{ fontSize: "10px", fontWeight: 600, textAlign: "center", color: "#718096" }}>Pred: {labels[0]}</div>
        <div style={{ fontSize: "10px", fontWeight: 600, textAlign: "center", color: "#718096" }}>Pred: {labels[1]}</div>

        <div style={{ fontSize: "10px", fontWeight: 600, color: "#718096", paddingRight: "6px", textAlign: "right" }}>Actual: {labels[0]}</div>
        <div style={cellStyle(matrix.tn, "#dcfce7")}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#198340" }}>{matrix.tn}</span>
          <span style={{ fontSize: "9px", color: "#718096" }}>TN</span>
        </div>
        <div style={cellStyle(matrix.fp, "#fef3c7")}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#b45309" }}>{matrix.fp}</span>
          <span style={{ fontSize: "9px", color: "#718096" }}>FP</span>
        </div>

        <div style={{ fontSize: "10px", fontWeight: 600, color: "#718096", paddingRight: "6px", textAlign: "right" }}>Actual: {labels[1]}</div>
        <div style={cellStyle(matrix.fn, "#fef3c7")}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#b45309" }}>{matrix.fn}</span>
          <span style={{ fontSize: "9px", color: "#718096" }}>FN</span>
        </div>
        <div style={cellStyle(matrix.tp, "#dcfce7")}>
          <span style={{ fontSize: "18px", fontWeight: 700, color: "#198340" }}>{matrix.tp}</span>
          <span style={{ fontSize: "9px", color: "#718096" }}>TP</span>
        </div>
      </div>
    </div>
  );
}

function FeatureImportanceChart({ data, maxImportance }: { data: typeof STUNTING_FEATURE_IMPORTANCE; maxImportance: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.map((item) => (
        <div key={item.predictor} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "10px", color: "#718096", width: "24px", textAlign: "right", fontWeight: 600 }}>{item.rank}.</span>
          <span style={{ fontSize: "11px", color: "#334155", width: "120px", fontWeight: 500 }}>{item.predictor}</span>
          <span style={{ fontSize: "10px", color: "#718096", width: "180px" }}>{item.label}</span>
          <div style={{ flex: 1, height: "16px", background: "#f1f5f9", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(item.importance / maxImportance) * 100}%`,
              background: "linear-gradient(90deg, #1265d8, #76b3f5)",
              borderRadius: "4px",
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{ fontSize: "10px", color: "#334155", fontWeight: 600, width: "50px", textAlign: "right" }}>{(item.importance * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

function OutcomeSection({ outcome, metrics, threshold, validationMetrics, featureImportance, featureMax, confusionLabels }: {
  outcome: string;
  metrics: typeof STUNTING_TEST_METRICS;
  threshold: number;
  validationMetrics: { accuracy: number; precision: number; recall: number; f1: number };
  featureImportance: typeof STUNTING_FEATURE_IMPORTANCE;
  featureMax: number;
  confusionLabels: [string, string];
}) {
  const [activeTab, setActiveTab] = useState<"test" | "validation" | "features" | "confusion">("test");

  return (
    <section className="panel" style={{ marginBottom: "18px" }}>
      <div className="panel-heading">
        <div>
          <h2 style={{ fontFamily: "Manrope", fontSize: "15px" }}>{outcome} Model</h2>
          <p style={{ fontSize: "11px", color: "#718096", margin: "2px 0 0" }}>
            XGBoost classifier &middot; Threshold: {threshold} &middot; 17 predictors
          </p>
        </div>
        <span className="model-tag">Held-Out Test</span>
      </div>

      <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #e3e9f1", padding: "0 20px" }}>
        {([
          ["test", "Held-Out Test"],
          ["validation", "Validation"],
          ["features", "Feature Importance"],
          ["confusion", "Confusion Matrix"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: "10px 16px",
              fontSize: "11px",
              fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? "#1265d8" : "#718096",
              borderBottom: activeTab === key ? "2px solid #1265d8" : "2px solid transparent",
              background: "transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px" }}>
        {activeTab === "test" && (
          <div>
            <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Final Held-Out Test Performance (Verified Research Result)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
              <MetricCard label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`} detail={`${metrics.testSize} test observations`} />
              <MetricCard label="Precision" value={`${(metrics.precision * 100).toFixed(1)}%`} detail="Positive predictive value" />
              <MetricCard label="Recall" value={`${(metrics.recall * 100).toFixed(1)}%`} detail="Sensitivity / true positive rate" />
              <MetricCard label="F1 Score" value={`${(metrics.f1 * 100).toFixed(1)}%`} detail="Harmonic mean of precision and recall" />
              <MetricCard label="ROC-AUC" value={`${(metrics.rocAuc * 100).toFixed(1)}%`} detail="Discrimination ability" color="#7651d6" />
              <MetricCard label="PR-AUC" value={`${(metrics.prAuc * 100).toFixed(1)}%`} detail="Precision-Recall area under curve" color="#7651d6" />
            </div>
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096" }}>
              False Positive Rate: {(metrics.fpr * 100).toFixed(1)}% &middot; Test set: {metrics.testSize} observations &middot; Threshold: {threshold}
            </div>
          </div>
        )}

        {activeTab === "validation" && (
          <div>
            <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Validation Performance — Final Model (Development Phase)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" }}>
              <MetricCard label="Accuracy" value={`${(validationMetrics.accuracy * 100).toFixed(1)}%`} detail="Validation set" />
              <MetricCard label="Precision" value={`${(validationMetrics.precision * 100).toFixed(1)}%`} detail="Validation set" />
              <MetricCard label="Recall" value={`${(validationMetrics.recall * 100).toFixed(1)}%`} detail="Validation set" />
              <MetricCard label="F1 Score" value={`${(validationMetrics.f1 * 100).toFixed(1)}%`} detail="Validation set" />
            </div>
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096" }}>
              Source: STEP 4L Precision-Recall Frontier Analysis &middot; Threshold: {threshold} &middot; Validation set
            </div>
          </div>
        )}

        {activeTab === "features" && (
          <div>
            <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Top 10 Predictors by Aggregated XGBoost Feature Importance (Verified Research Result)
            </div>
            <FeatureImportanceChart data={featureImportance} maxImportance={featureMax} />
          </div>
        )}

        {activeTab === "confusion" && (
          <div>
            <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Confusion Matrix (Verified Research Result)
            </div>
            <ConfusionMatrix matrix={metrics.confusionMatrix} labels={confusionLabels} />
            <div style={{ marginTop: "16px", padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096", lineHeight: 1.6 }}>
              <strong>Interpretation:</strong> TN = {metrics.confusionMatrix.tn} correctly predicted negative &middot;
              TP = {metrics.confusionMatrix.tp} correctly predicted positive &middot;
              FP = {metrics.confusionMatrix.fp} false alarms &middot;
              FN = {metrics.confusionMatrix.fn} missed cases
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ModelPerformance({ onLogout }: { onLogout?: () => void }) {
  const { t } = useTranslation();
  return (
    <Shell title={t("routes.model")} subtitle={t("model.subtitle")} onLogout={onLogout}>
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">{t("dashboard.home")}</Link>
          <ChevronRight size={13} /> {t("routes.model")}
        </div>

        <section className="panel" style={{ marginBottom: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2 style={{ fontFamily: "Manrope", fontSize: "15px" }}>Model Information</h2>
              <p style={{ fontSize: "11px", color: "#718096", margin: "2px 0 0" }}>Dual-outcome XGBoost classification system</p>
            </div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600 }}>Algorithm</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{MODEL_INFO.algorithm}</div>
              </div>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600 }}>Data Source</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{MODEL_INFO.data_source}</div>
              </div>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600 }}>Country</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{MODEL_INFO.country}</div>
              </div>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600 }}>Predictors</div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{MODEL_INFO.num_predictors} ({MODEL_INFO.numeric_predictors} numeric, {MODEL_INFO.categorical_predictors} categorical)</div>
              </div>
            </div>
            <div style={{ marginTop: "12px", padding: "12px", background: "#eaf3ff", borderRadius: "6px", border: "1px solid #cfe1fa" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#1265d8", marginBottom: "4px" }}>Outcomes</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {MODEL_INFO.outcomes.map((o) => (
                  <span key={o} style={{ fontSize: "10px", padding: "4px 10px", background: "white", borderRadius: "12px", border: "1px solid #cfe1fa", fontWeight: 500, color: "#1265d8" }}>{o}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <OutcomeSection
          outcome="Stunting (Height-for-Age)"
          metrics={STUNTING_TEST_METRICS}
          threshold={STUNTING_THRESHOLD}
          validationMetrics={STUNTING_VALIDATION_METRICS}
          featureImportance={STUNTING_FEATURE_IMPORTANCE}
          featureMax={0.1818}
          confusionLabels={["Not Stunted", "Stunted"]}
        />

        <OutcomeSection
          outcome="Underweight (Weight-for-Age)"
          metrics={UNDERWEIGHT_TEST_METRICS}
          threshold={UNDERWEIGHT_THRESHOLD}
          validationMetrics={UNDERWEIGHT_VALIDATION_METRICS}
          featureImportance={UNDERWEIGHT_FEATURE_IMPORTANCE}
          featureMax={0.1771}
          confusionLabels={["Not Underweight", "Underweight"]}
        />

        <section className="panel" style={{ marginBottom: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2 style={{ fontFamily: "Manrope", fontSize: "15px" }}>Threshold Information</h2>
              <p style={{ fontSize: "11px", color: "#718096", margin: "2px 0 0" }}>Outcome-specific classification thresholds</p>
            </div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ padding: "16px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                <div style={{ fontSize: "10px", color: "#198340", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stunting</div>
                <div style={{ fontFamily: "Manrope", fontSize: "28px", fontWeight: 800, color: "#198340", margin: "4px 0" }}>{STUNTING_THRESHOLD}</div>
                <div style={{ fontSize: "10px", color: "#718096" }}>Classification threshold for stunting detection</div>
              </div>
              <div style={{ padding: "16px", background: "#fef3c7", borderRadius: "8px", border: "1px solid #fde68a" }}>
                <div style={{ fontSize: "10px", color: "#b45309", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Underweight</div>
                <div style={{ fontFamily: "Manrope", fontSize: "28px", fontWeight: 800, color: "#b45309", margin: "4px 0" }}>{UNDERWEIGHT_THRESHOLD}</div>
                <div style={{ fontSize: "10px", color: "#718096" }}>Classification threshold for underweight detection</div>
              </div>
            </div>
            <div style={{ marginTop: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096", lineHeight: 1.6 }}>
              These are outcome-specific classification thresholds established during model development. Predicted probabilities at or above the threshold are classified as elevated risk. Thresholds were selected based on precision-recall analysis on the validation set.
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginBottom: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2 style={{ fontFamily: "Manrope", fontSize: "15px" }}>Research Disclaimer</h2>
            </div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ padding: "14px 16px", background: "#fef3c7", borderRadius: "8px", border: "1px solid #fde68a", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <AlertTriangle size={18} style={{ color: "#b45309", marginTop: "2px", flexShrink: 0 }} />
              <div style={{ fontSize: "11px", color: "#718096", lineHeight: 1.6 }}>
                <strong style={{ color: "#334155" }}>Research Disclaimer:</strong> The displayed model-performance results describe predictive performance and should not be interpreted as causal effects or as a substitute for professional nutritional assessment. These metrics reflect the model&apos;s ability to classify risk based on the CAR MICS6 dataset and should be interpreted within the context of the data source, population, and study design.
              </div>
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginBottom: "18px" }}>
          <div className="panel-heading">
            <div>
              <h2 style={{ fontFamily: "Manrope", fontSize: "15px" }}>Data Source & Methodology</h2>
            </div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "6px" }}>Verified Research Result</div>
                <ul style={{ fontSize: "10px", color: "#334155", margin: 0, paddingLeft: "16px", lineHeight: 1.8 }}>
                  <li>Final held-out test metrics (accuracy, precision, recall, F1, ROC-AUC, PR-AUC)</li>
                  <li>Confusion matrices (TN, FP, FN, TP)</li>
                  <li>Feature importance rankings</li>
                  <li>Classification thresholds (0.53, 0.51)</li>
                </ul>
              </div>
              <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1" }}>
                <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "6px" }}>Stored Model Metadata</div>
                <ul style={{ fontSize: "10px", color: "#334155", margin: 0, paddingLeft: "16px", lineHeight: 1.8 }}>
                  <li>Validation/development performance metrics</li>
                  <li>Model version (v2.4.1)</li>
                  <li>Training/test split sizes (80/20)</li>
                  <li>Algorithm configuration (XGBoost parameters)</li>
                </ul>
              </div>
            </div>
            <div style={{ marginTop: "12px", padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096", lineHeight: 1.6 }}>
              <strong>Data Source:</strong> CAR MICS6 (Multiple Indicator Cluster Survey, Round 6) &middot; Central African Republic &middot; 9,037 child records &middot; 17 predictors &middot; XGBoost binary classification with OneHotEncoder + StandardScaler preprocessing pipeline.
            </div>
            <div style={{ marginTop: "8px", padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", fontSize: "10px", color: "#718096", lineHeight: 1.6 }}>
              <strong>Methodology Note:</strong> Validation results were obtained during model development and threshold selection. Final held-out test results were evaluated once on the reserved test set after model and threshold selection. Validation and test performance are not expected to be identical, as test data was never accessed during development.
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
