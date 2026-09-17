import { useMemo, useRef, useState, useEffect } from "react";
import { Link } from "wouter";
import {
  ChevronRight,
  Download,
  FileText,
  AlertTriangle,
  Clock,
  TrendingDown,
  TrendingUp,
  Minus,
  Activity,
  HeartPulse,
  Stethoscope,
  ChevronDown,
  FileSpreadsheet,
  FileJson,
  ArrowLeft,
  ClipboardList,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

const PREDICTOR_LABELS: Record<string, string> = {
  CAGE: "Child Age", WB4: "Child Weight", WAGEM: "Mother's Age", CEB: "Children Ever Born",
  CSURV: "Children Surviving", CDEAD: "Children Who Died", CM11: "Birth Interval",
  HL4: "Child Sex", HH6: "Place of Residence", windex5: "Household Wealth",
  WS1: "Drinking Water Source", WS11: "Toilet Facility", WS15: "Water Treatment",
  welevel: "Mother's Education", MSTATUS: "Marital Status", CM17: "Recent Live Births",
  insurance: "Health Insurance",
};

const PREDICTOR_UNITS: Record<string, string> = {
  CAGE: "months", WB4: "kg", WAGEM: "years", CEB: "", CSURV: "", CDEAD: "", CM11: "months",
};

const CHILD_GROUP = ["CAGE", "WB4", "HL4"];
const MATERNAL_GROUP = ["WAGEM", "CEB", "CSURV", "CDEAD", "CM11", "MSTATUS", "CM17"];
const HOUSEHOLD_GROUP = ["HH6", "windex5", "WS1", "WS11", "WS15", "welevel", "insurance"];

function getRiskPriority(stuntingHigh: boolean, underweightHigh: boolean, stuntingProb: number, stuntingThreshold: number, underweightProb: number | null, underweightThreshold: number) {
  const both = stuntingHigh && underweightHigh;
  if (both) return { level: "higher", label: "Higher-Priority Follow-up", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: <ShieldAlert size={14} /> };
  if (stuntingHigh && stuntingProb >= stuntingThreshold + 0.15) return { level: "higher", label: "Higher-Priority Follow-up", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: <ShieldAlert size={14} /> };
  if (underweightProb != null && underweightHigh && underweightProb >= underweightThreshold + 0.15) return { level: "higher", label: "Higher-Priority Follow-up", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: <ShieldAlert size={14} /> };
  if (stuntingHigh || underweightHigh) return { level: "priority", label: "Priority Follow-up", color: "#b45309", bg: "#fef3c7", border: "#fde68a", icon: <Shield size={14} /> };
  const stuntingModerate = !stuntingHigh && stuntingProb >= stuntingThreshold * 0.85;
  const underweightModerate = underweightProb != null && !underweightHigh && underweightProb >= underweightThreshold * 0.85;
  if (stuntingModerate || underweightModerate) return { level: "moderate", label: "Close Monitoring Recommended", color: "#b45309", bg: "#fef3c7", border: "#fde68a", icon: <Shield size={14} /> };
  return { level: "routine", label: "Routine Follow-up", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: <ShieldCheck size={14} /> };
}

function Shell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="main">
        <div className="topbar">
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="main-inner">{children}</div>
      </div>
    </div>
  );
}

function ExportDropdown({ onExport }: { onExport: (fmt: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const options = [
    { fmt: "txt", label: "Plain Text", sub: ".txt", icon: <FileText size={14} /> },
    { fmt: "csv", label: "Spreadsheet", sub: ".csv", icon: <FileSpreadsheet size={14} /> },
    { fmt: "json", label: "JSON Data", sub: ".json", icon: <FileJson size={14} /> },
    { fmt: "pdf", label: "Print / PDF", sub: "via browser", icon: <Download size={14} /> },
  ];

  return (
    <div ref={ref} className="rp-export-wrap">
      <button className="rp-export-btn" onClick={() => setOpen(!open)}>
        <Download size={14} /> Export <ChevronDown size={12} className={`rp-export-chevron ${open ? "open" : ""}`} />
      </button>
      {open && (
        <div className="rp-export-menu">
          <div className="rp-export-menu-label">Export as</div>
          {options.map((o) => (
            <button key={o.fmt} className="rp-export-item" onClick={() => { onExport(o.fmt); setOpen(false); }}>
              <span className="rp-export-item-icon">{o.icon}</span>
              <span className="rp-export-item-text">
                <span>{o.label}</span>
                <small>{o.sub}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiskProfile({ predictionId }: { predictionId?: string }) {
  const [showInputs, setShowInputs] = useState(false);

  const query = trpc.history.getByPredictionId.useQuery(
    { predictionId: predictionId ?? "" },
    { enabled: !!predictionId }
  );

  const allPredictions = trpc.history.list.useQuery(undefined, { enabled: !!query.data?.childId });

  const record = query.data;

  const previousAssessments = useMemo(() => {
    if (!record || !allPredictions.data) return [];
    return allPredictions.data
      .filter((p: any) => (p.childIdStr ?? String(p.childId)) === record.childId && p.predictionId !== record.predictionId)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [record, allPredictions.data]);

  if (query.isLoading) {
    return (
      <Shell title="Risk Profile" subtitle="Loading assessment...">
        <div className="page-content">
          <div className="breadcrumb">
            <Link href="/dashboard">Home</Link>
            <ChevronRight size={13} /> Risk Profile
          </div>
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Loading risk profile...</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (!record) {
    return (
      <Shell title="Risk Profile" subtitle="Not found">
        <div className="page-content">
          <div className="breadcrumb">
            <Link href="/dashboard">Home</Link>
            <ChevronRight size={13} /> Risk Profile
          </div>
          <div className="empty-state">
            <div className="empty-icon"><FileText size={28} /></div>
            <h3>Assessment not found</h3>
            <p>This record may have been removed.</p>
            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <Link href="/history" className="primary-btn">Back to History</Link>
              <Link href="/prediction/new" className="secondary-btn">New Assessment</Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const hasStunting = record.stuntingProbability != null;
  const hasUnderweight = record.underweightProbability != null;
  const stuntingProb = hasStunting ? Number(record.stuntingProbability) : Number(record.probability);
  const stuntingThreshold = hasStunting ? Number(record.stuntingThreshold) : 0.53;
  const stuntingHigh = stuntingProb >= stuntingThreshold;
  const underweightProb = hasUnderweight ? Number(record.underweightProbability) : null;
  const underweightThreshold = hasUnderweight ? Number(record.underweightThreshold) : 0.51;
  const underweightHigh = underweightProb != null ? underweightProb >= underweightThreshold : false;
  const combinedRisk = record.combinedRisk ?? (stuntingHigh || underweightHigh ? "HIGH RISK" : "LOW RISK");
  const isElevated = combinedRisk === "HIGH RISK";
  const isModerate = combinedRisk === "MODERATE RISK";
  const stuntingDiff = (stuntingProb - stuntingThreshold) * 100;
  const underweightDiff = underweightProb != null ? (underweightProb - underweightThreshold) * 100 : null;
  const assessmentDate = record.createdAt ? new Date(record.createdAt) : null;
  const dateStr = assessmentDate ? assessmentDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A";
  const timeStr = assessmentDate ? assessmentDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
  const recommendations = Array.isArray(record.recommendations) ? record.recommendations : [];
  const stuntingRecs = recommendations.filter((r: string) => r.toLowerCase().includes("stunting") || r.toLowerCase().includes("growth") || r.toLowerCase().includes("height"));
  const underweightRecs = recommendations.filter((r: string) => r.toLowerCase().includes("underweight") || r.toLowerCase().includes("weight") || r.toLowerCase().includes("dietary"));
  const generalRecs = recommendations.filter((r: string) => !stuntingRecs.includes(r) && !underweightRecs.includes(r));
  const actionRecs = [...stuntingRecs, ...underweightRecs];
  const followUpRecs = generalRecs;
  const priority = getRiskPriority(stuntingHigh, underweightHigh, stuntingProb, stuntingThreshold, underweightProb, underweightThreshold);
  const inputData = record.inputData as Record<string, string> | null;

  const topFeatures = (() => {
    const features: Array<{ variable: string; importance: number }> = [];
    const seen = new Set<string>();
    const raw = (record as any).featureImportance ?? (record as any).feature_importance ?? null;
    if (!raw) return features;

    let entries: Array<{ variable: string; importance: number }> = [];

    if (Array.isArray(raw)) {
      entries = raw;
    } else if (typeof raw === "string") {
      try { entries = JSON.parse(raw); } catch { /* leave empty */ }
    } else if (raw.stunting || raw.underweight) {
      const map = new Map<string, number>();
      for (const e of raw.stunting ?? []) { map.set(e.variable, (map.get(e.variable) ?? 0) + e.importance); }
      for (const e of raw.underweight ?? []) { map.set(e.variable, (map.get(e.variable) ?? 0) + e.importance); }
      entries = [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([variable, importance]) => ({ variable, importance }));
    }

    for (const f of entries) {
      if (f && typeof f.variable === "string" && f.variable && typeof f.importance === "number" && !isNaN(f.importance)) {
        if (!seen.has(f.variable)) { seen.add(f.variable); features.push(f); }
      }
    }
    return features.slice(0, 6);
  })();

  const maxImportance = topFeatures.length > 0 ? Math.max(...topFeatures.map((f) => f.importance)) : 1;

  const trendForPrev = (prev: any) => {
    const prevStuntingHigh = prev.stuntingProbability != null ? Number(prev.stuntingProbability) >= Number(prev.stuntingThreshold ?? 0.53) : false;
    const prevUnderweightHigh = prev.underweightProbability != null ? Number(prev.underweightProbability) >= Number(prev.underweightThreshold ?? 0.51) : false;
    const prevHigh = prevStuntingHigh || prevUnderweightHigh;
    if (isElevated && !prevHigh) return "increased";
    if (!isElevated && prevHigh) return "improved";
    return "similar";
  };

  const buildExportText = () => {
    const ageStr = record.age != null ? `${record.age} months` : "N/A";
    const sexStr = record.sex ?? "N/A";
    return [
      "CHILD NUTRITION RISK PROFILE",
      "============================",
      "",
      `Assessment ID: ${record.predictionId}`,
      `Child ID: ${record.childId}`,
      `Age: ${ageStr}`,
      `Sex: ${sexStr}`,
      `Date: ${dateStr} ${timeStr}`,
      `Overall Risk: ${combinedRisk}`,
      `Follow-up Priority: ${priority.label}`,
      "",
      "STUNTING SCREENING",
      `  Probability: ${(stuntingProb * 100).toFixed(1)}%`,
      `  Threshold: ${(stuntingThreshold * 100).toFixed(0)}%`,
      `  Result: ${stuntingHigh ? "Elevated Risk" : "Normal Range"}`,
      "",
      "UNDERWEIGHT SCREENING",
      `  Probability: ${hasUnderweight ? `${(underweightProb! * 100).toFixed(1)}%` : "Not available"}`,
      `  Threshold: ${(underweightThreshold * 100).toFixed(0)}%`,
      `  Result: ${hasUnderweight ? (underweightHigh ? "Elevated Risk" : "Normal Range") : "Not available"}`,
      "",
      "FEATURE IMPORTANCE",
      ...topFeatures.map((f) => `  ${PREDICTOR_LABELS[f.variable] ?? f.variable}: ${(f.importance * 100).toFixed(1)}%`),
      "",
      "RECOMMENDATIONS",
      ...recommendations,
      "",
      "DISCLAIMER",
      "This system provides decision-support screening and is not a medical diagnosis.",
      "Results should be interpreted by a qualified nutrition/health professional.",
    ].join("\n");
  };

  const buildCSV = () => {
    const ageStr = record.age != null ? String(record.age) : "";
    const sexStr = record.sex ?? "";
    const rows = [
      ["Field", "Value"],
      ["Assessment ID", record.predictionId],
      ["Child ID", record.childId],
      ["Age (months)", ageStr],
      ["Sex", sexStr],
      ["Date", `${dateStr} ${timeStr}`],
      ["Overall Risk", combinedRisk],
      ["Follow-up Priority", priority.label],
      ["Stunting Probability", `${(stuntingProb * 100).toFixed(1)}%`],
      ["Stunting Threshold", `${(stuntingThreshold * 100).toFixed(0)}%`],
      ["Stunting Result", stuntingHigh ? "Elevated Risk" : "Normal Range"],
      ["Underweight Probability", hasUnderweight ? `${(underweightProb! * 100).toFixed(1)}%` : "N/A"],
      ["Underweight Threshold", `${(underweightThreshold * 100).toFixed(0)}%`],
      ["Underweight Result", hasUnderweight ? (underweightHigh ? "Elevated Risk" : "Normal Range") : "N/A"],
      [],
      ["Feature", "Importance"],
      ...topFeatures.map((f) => [PREDICTOR_LABELS[f.variable] ?? f.variable, `${(f.importance * 100).toFixed(1)}%`]),
      [],
      ["Recommendation", ...recommendations],
    ];
    return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  };

  const buildJSON = () => {
    return JSON.stringify({
      assessmentId: record.predictionId,
      childId: record.childId,
      age: record.age,
      sex: record.sex,
      date: record.createdAt,
      overallRisk: combinedRisk,
      followUpPriority: priority.label,
      stunting: { probability: stuntingProb, threshold: stuntingThreshold, result: stuntingHigh ? "Elevated" : "Normal" },
      underweight: underweightProb != null ? { probability: underweightProb, threshold: underweightThreshold, result: underweightHigh ? "Elevated" : "Normal" } : null,
      featureImportance: topFeatures.map((f) => ({ variable: f.variable, label: PREDICTOR_LABELS[f.variable] ?? f.variable, importance: f.importance })),
      recommendations,
    }, null, 2);
  };

  const exportAs = (fmt: string) => {
    let content: string;
    let mime: string;
    let ext: string;

    switch (fmt) {
      case "csv":
        content = buildCSV();
        mime = "text/csv;charset=utf-8";
        ext = "csv";
        break;
      case "json":
        content = buildJSON();
        mime = "application/json;charset=utf-8";
        ext = "json";
        break;
      case "pdf":
        content = buildExportText();
        mime = "text/plain;charset=utf-8";
        ext = "txt";
        toast.info("PDF export: downloading as text. Use browser Print to save as PDF.");
        break;
      default:
        content = buildExportText();
        mime = "text/plain;charset=utf-8";
        ext = "txt";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `risk-profile-${record.childId}-${record.predictionId}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported as ${ext.toUpperCase()}`);
  };

  return (
    <Shell title="Risk Profile" subtitle={record.predictionId}>
      <div className="page-content">
        <div className="breadcrumb">
          <Link href="/dashboard">Home</Link>
          <ChevronRight size={13} /> Risk Profile
        </div>

        {/* ═══════ STATUS STRIP ═══════ */}
        <div className={`rp-status-strip ${isElevated ? "danger" : isModerate ? "warn" : "safe"}`}>
          <div className="rp-status-glow" />
          <div className="rp-status-content">
            <div className="rp-status-icon-ring">
              {isElevated ? <AlertTriangle size={22} /> : isModerate ? <AlertTriangle size={22} /> : <HeartPulse size={22} />}
            </div>
            <div className="rp-status-text">
              <h2>{isElevated ? "Elevated Risk Detected" : isModerate ? "Borderline / Moderate Risk" : "Within Normal Range"}</h2>
              <p>
                {isElevated
                  ? stuntingHigh && underweightHigh
                    ? "Both stunting and underweight indicators above threshold. Priority follow-up is recommended."
                    : stuntingHigh
                      ? "Stunting probability exceeds threshold. Follow-up recommended."
                      : "Underweight probability exceeds threshold. Follow-up recommended."
                  : isModerate
                    ? "One or more indicators are approaching threshold levels. Close monitoring and follow-up recommended."
                    : "Both indicators within model's normal range. Routine monitoring advised."}
              </p>
            </div>
            <div className="rp-status-badge-area">
              <div className="rp-priority-chip" style={{ background: priority.bg, color: priority.color, borderColor: priority.border }}>
                {priority.icon} {priority.label}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════ CHILD INFO STRIP ═══════ */}
        <div className="rp-child-strip">
          <div className="rp-child-id">
            <span className="rp-child-id-tag">ID</span>
            <span className="rp-child-id-val">{record.childId}</span>
          </div>
          <div className="rp-child-sep" />
          {record.age != null && (
            <>
              <div className="rp-child-meta">
                <span className="rp-child-meta-label">Age</span>
                <span className="rp-child-meta-val">{record.age} months</span>
              </div>
              <div className="rp-child-sep" />
            </>
          )}
          {record.sex && (
            <>
              <div className="rp-child-meta">
                <span className="rp-child-meta-label">Sex</span>
                <span className="rp-child-meta-val">{record.sex}</span>
              </div>
              <div className="rp-child-sep" />
            </>
          )}
          <div className="rp-child-meta">
            <span className="rp-child-meta-label">Date</span>
            <span className="rp-child-meta-val">{dateStr}</span>
          </div>
          <div className="rp-child-sep" />
          <div className="rp-child-meta">
            <span className="rp-child-meta-label">Time</span>
            <span className="rp-child-meta-val">{timeStr}</span>
          </div>
          <div className="rp-child-sep" />
          <div className="rp-child-meta">
            <span className="rp-child-meta-label">Assessment</span>
            <span className="rp-child-meta-val rp-mono">{record.predictionId}</span>
          </div>
        </div>

        {/* ═══════ SCREENING RESULTS ═══════ */}
        <div className="rp-dual-panel">
          {/* Stunting */}
          <div className="rp-dual-card">
            <div className="rp-dual-card-accent" style={{ background: stuntingHigh ? "linear-gradient(180deg, #dc2626 0%, #991b1b 100%)" : "linear-gradient(180deg, #16a34a 0%, #15803d 100%)" }} />
            <div className="rp-dual-card-body">
              <div className="rp-dual-head">
                <div className={`rp-dual-icon ${stuntingHigh ? "danger" : "safe"}`}>
                  <Activity size={16} />
                </div>
                <div className="rp-dual-head-text">
                  <h3>Stunting</h3>
                  <span>Height-for-age</span>
                </div>
                <span className={`rp-dual-result ${stuntingHigh ? "danger" : "safe"}`}>
                  {stuntingHigh ? "ELEVATED" : "NORMAL"}
                </span>
              </div>
              <div className="rp-dual-big-num">
                <span className="rp-dual-pct">{(stuntingProb * 100).toFixed(1)}<small>%</small></span>
                <span className="rp-dual-thresh">threshold {(stuntingThreshold * 100).toFixed(0)}%</span>
              </div>
              <div className="rp-dual-bar">
                <div className="rp-dual-bar-bg">
                  <div className={`rp-dual-bar-fill ${stuntingHigh ? "danger" : "safe"}`} style={{ width: `${Math.min(stuntingProb * 100, 100)}%` }} />
                </div>
                <div className="rp-dual-bar-marker" style={{ left: `${stuntingThreshold * 100}%` }} />
              </div>
              <div className="rp-dual-delta" style={{ color: stuntingHigh ? "#dc2626" : "#16a34a" }}>
                {stuntingHigh ? "+" : ""}{stuntingDiff.toFixed(1)} pp {stuntingHigh ? "above" : "below"} threshold
              </div>
            </div>
          </div>

          {/* Underweight */}
          <div className="rp-dual-card">
            <div className="rp-dual-card-accent" style={{ background: !hasUnderweight ? "#e2e8f0" : underweightHigh ? "linear-gradient(180deg, #dc2626 0%, #991b1b 100%)" : "linear-gradient(180deg, #16a34a 0%, #15803d 100%)" }} />
            <div className="rp-dual-card-body">
              <div className="rp-dual-head">
                <div className={`rp-dual-icon ${!hasUnderweight ? "na" : underweightHigh ? "danger" : "safe"}`}>
                  <Stethoscope size={16} />
                </div>
                <div className="rp-dual-head-text">
                  <h3>Underweight</h3>
                  <span>Weight-for-age</span>
                </div>
                <span className={`rp-dual-result ${!hasUnderweight ? "na" : underweightHigh ? "danger" : "safe"}`}>
                  {hasUnderweight ? (underweightHigh ? "ELEVATED" : "NORMAL") : "N/A"}
                </span>
              </div>
              {hasUnderweight && underweightProb != null ? (
                <>
                  <div className="rp-dual-big-num">
                    <span className="rp-dual-pct">{(underweightProb * 100).toFixed(1)}<small>%</small></span>
                    <span className="rp-dual-thresh">threshold {(underweightThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <div className="rp-dual-bar">
                    <div className="rp-dual-bar-bg">
                      <div className={`rp-dual-bar-fill ${underweightHigh ? "danger" : "safe"}`} style={{ width: `${Math.min(underweightProb * 100, 100)}%` }} />
                    </div>
                    <div className="rp-dual-bar-marker" style={{ left: `${underweightThreshold * 100}%` }} />
                  </div>
                  <div className="rp-dual-delta" style={{ color: underweightHigh ? "#dc2626" : "#16a34a" }}>
                    {underweightHigh ? "+" : ""}{underweightDiff!.toFixed(1)} pp {underweightHigh ? "above" : "below"} threshold
                  </div>
                </>
              ) : (
                <div className="rp-dual-unavailable">
                  <p>Underweight data not recorded for this assessment.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════ FEATURE IMPORTANCE ═══════ */}
        <section className="rp-card">
            <div className="rp-card-header">
              <div className="rp-card-header-icon"><Activity size={15} /></div>
              <div>
                <h3>Key Contributing Factors</h3>
                <p>Model input factors most associated with this prediction — not causal indicators.</p>
              </div>
            </div>
            {topFeatures.length > 0 ? (
              <div className="rp-feat-list">
                {topFeatures.map((f, i) => {
                  const pct = (f.importance / maxImportance) * 100;
                  return (
                    <div key={i} className="rp-feat-row">
                      <span className="rp-feat-rank">{String(i + 1).padStart(2, "0")}</span>
                      <div className="rp-feat-info">
                        <span className="rp-feat-name">{PREDICTOR_LABELS[f.variable] ?? f.variable}</span>
                        <div className="rp-feat-bar-track">
                          <div className="rp-feat-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="rp-feat-val">{(f.importance * 100).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rp-empty">Feature importance data is not available for this assessment.</div>
            )}
        </section>

        {/* ═══════ RECOMMENDATIONS ═══════ */}
        {recommendations.length > 0 && (
          <section className="rp-card">
            <div className="rp-card-header">
              <div className="rp-card-header-icon rp-card-header-icon--amber"><ClipboardList size={15} /></div>
              <div>
                <h3>Recommendations</h3>
                <p>Rule-based guidance from screening outcomes — not clinical prescriptions.</p>
              </div>
            </div>
            <div className="rp-recs">
              {actionRecs.length > 0 && (
                <div className="rp-rec-block">
                  <div className="rp-rec-label"><AlertTriangle size={11} /> Actions</div>
                  <ul>
                    {actionRecs.map((r: string, i: number) => <li key={`a-${i}`}>{r}</li>)}
                  </ul>
                </div>
              )}
              {followUpRecs.length > 0 && (
                <div className="rp-rec-block">
                  <div className="rp-rec-label"><Clock size={11} /> Follow-up</div>
                  <ul>
                    {followUpRecs.map((r: string, i: number) => <li key={`f-${i}`}>{r}</li>)}
                  </ul>
                </div>
              )}
              {isElevated && (
                <div className="rp-rec-block">
                  <div className="rp-rec-label"><Stethoscope size={11} /> Referral</div>
                  <ul>
                    <li>Consider referral for anthropometric verification and clinical assessment.</li>
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ═══════ HISTORY ═══════ */}
        {previousAssessments.length > 0 && (
          <section className="rp-card">
            <div className="rp-card-header">
              <div className="rp-card-header-icon rp-card-header-icon--slate"><Clock size={15} /></div>
              <div>
                <h3>Previous Assessments</h3>
                <p>Comparison with earlier screenings for this child.</p>
              </div>
            </div>
            <div className="rp-history-wrap">
              <table className="rp-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Stunting</th>
                    <th>Underweight</th>
                    <th>Status</th>
                    <th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="rp-history-current">
                    <td className="rp-history-date">{dateStr}</td>
                    <td><span className={`rp-result-chip ${stuntingHigh ? "danger" : "safe"}`}>{(stuntingProb * 100).toFixed(1)}%</span></td>
                    <td>{hasUnderweight ? <span className={`rp-result-chip ${underweightHigh ? "danger" : "safe"}`}>{(underweightProb! * 100).toFixed(1)}%</span> : <span className="rp-result-chip na">N/A</span>}</td>
                    <td><span className={`rp-risk-dot ${isElevated ? "danger" : "safe"}`}><span />{isElevated ? "Elevated" : "Normal"}</span></td>
                    <td><span className="rp-history-current-tag">Current</span></td>
                  </tr>
                  {previousAssessments.map((prev: any) => {
                    const prevDate = prev.createdAt ? new Date(prev.createdAt) : null;
                    const prevDateStr = prevDate ? prevDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "N/A";
                    const prevSP = prev.stuntingProbability != null ? Number(prev.stuntingProbability) : Number(prev.probability ?? 0);
                    const prevST = prev.stuntingThreshold != null ? Number(prev.stuntingThreshold) : 0.53;
                    const prevSH = prevSP >= prevST;
                    const prevUP = prev.underweightProbability != null ? Number(prev.underweightProbability) : null;
                    const prevUT = prev.underweightThreshold != null ? Number(prev.underweightThreshold) : 0.51;
                    const prevUH = prevUP != null ? prevUP >= prevUT : false;
                    const prevCR = prev.combinedRisk ?? (prevSH || prevUH ? "HIGH RISK" : "LOW RISK");
                    const prevElev = prevCR === "HIGH RISK";
                    const trend = trendForPrev(prev);
                    return (
                      <tr key={prev.predictionId}>
                        <td className="rp-history-date">{prevDateStr}</td>
                        <td><span className={`rp-result-chip ${prevSH ? "danger" : "safe"}`}>{(prevSP * 100).toFixed(1)}%</span></td>
                        <td>{prev.underweightProbability != null ? <span className={`rp-result-chip ${prevUH ? "danger" : "safe"}`}>{(prevUP! * 100).toFixed(1)}%</span> : <span className="rp-result-chip na">N/A</span>}</td>
                        <td><span className={`rp-risk-dot ${prevElev ? "danger" : "safe"}`}><span />{prevElev ? "Elevated" : "Normal"}</span></td>
                        <td>
                          <span className={`rp-trend ${trend}`}>
                            {trend === "improved" && <><TrendingDown size={11} /> Improved</>}
                            {trend === "increased" && <><TrendingUp size={11} /> Increased</>}
                            {trend === "similar" && <><Minus size={11} /> Similar</>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ═══════ INPUTS (Collapsible) ═══════ */}
        {inputData && (
          <section className="rp-card">
            <button className="rp-card-header rp-card-toggle" onClick={() => setShowInputs(!showInputs)}>
              <div className="rp-card-header-icon rp-card-header-icon--slate"><FileText size={15} /></div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <h3>Assessment Inputs</h3>
                <p>Variables used in this screening.</p>
              </div>
              <ChevronDown size={16} className={`rp-toggle-arrow ${showInputs ? "open" : ""}`} />
            </button>
            {showInputs && (
              <div className="rp-input-grid">
                <div className="rp-input-col">
                  <h4>Child</h4>
                  {CHILD_GROUP.filter(k => inputData[k] != null).map(k => (
                    <div key={k} className="rp-input-row">
                      <span>{PREDICTOR_LABELS[k] ?? k}</span>
                      <span className="rp-input-val">{inputData[k]}{PREDICTOR_UNITS[k] ? ` ${PREDICTOR_UNITS[k]}` : ""}</span>
                    </div>
                  ))}
                </div>
                <div className="rp-input-col">
                  <h4>Maternal</h4>
                  {MATERNAL_GROUP.filter(k => inputData[k] != null).map(k => (
                    <div key={k} className="rp-input-row">
                      <span>{PREDICTOR_LABELS[k] ?? k}</span>
                      <span className="rp-input-val">{inputData[k]}{PREDICTOR_UNITS[k] ? ` ${PREDICTOR_UNITS[k]}` : ""}</span>
                    </div>
                  ))}
                </div>
                <div className="rp-input-col">
                  <h4>Household</h4>
                  {HOUSEHOLD_GROUP.filter(k => inputData[k] != null).map(k => (
                    <div key={k} className="rp-input-row">
                      <span>{PREDICTOR_LABELS[k] ?? k}</span>
                      <span className="rp-input-val">{inputData[k]}{PREDICTOR_UNITS[k] ? ` ${PREDICTOR_UNITS[k]}` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ═══════ DISCLAIMER ═══════ */}
        <div className="rp-disclaimer">
          <Shield size={14} />
          <span>Decision-support screening only — not a medical diagnosis. Results are model-estimated probabilities and should be interpreted by a qualified nutrition/health professional.</span>
        </div>

        {/* ═══════ BOTTOM ACTIONS ═══════ */}
        <div className="rp-bottom-bar">
          <div className="rp-bottom-left">
            <Link href="/history" className="rp-nav-btn secondary"><ArrowLeft size={14} /> Back to History</Link>
            <Link href="/prediction/new" className="rp-nav-btn secondary"><ClipboardList size={14} /> New Assessment</Link>
            <Link href="/dashboard" className="rp-nav-btn secondary"><LayoutDashboard size={14} /> Dashboard</Link>
          </div>
          <div className="rp-bottom-right">
            <ExportDropdown onExport={exportAs} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
