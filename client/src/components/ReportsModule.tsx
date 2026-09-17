import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Plus, ChevronRight, ChevronLeft, FileText, Eye, X, BarChart3, Filter, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";

type ReportRow = {
  id: number;
  reportType: string;
  generatedBy: number;
  fileUrl: string | null;
  format: string;
  createdAt: string;
};

const PAGE_SIZE = 8;

const REPORT_TYPES = [
  { value: "high-risk", label: "High Risk Cases", description: "Children flagged as high risk for stunting or underweight" },
  { value: "daily", label: "Daily Summary", description: "Summary of all activities and assessments for the day" },
  { value: "weekly", label: "Weekly Summary", description: "Aggregated weekly nutrition screening results" },
  { value: "monthly", label: "Monthly Summary", description: "Monthly overview of screening outcomes and trends" },
  { value: "child-specific", label: "Child-Specific Report", description: "Detailed report for a specific child's assessment history" },
  { value: "officer", label: "Officer Activity", description: "Activity report for a specific nutrition officer" },
  { value: "model-performance", label: "Model Performance", description: "ML model accuracy, precision, recall, and F1 metrics" },
] as const;

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV", description: "Comma-separated values" },
  { value: "xlsx", label: "Excel (XLSX)", description: "Microsoft Excel spreadsheet" },
  { value: "print", label: "Print View", description: "Opens a clean print-friendly page" },
  { value: "pdf", label: "PDF", description: "Not yet implemented" },
] as const;

function formatReportType(t: string) {
  const found = REPORT_TYPES.find((rt) => rt.value === t);
  return found?.label ?? t.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function getReportTypeDescription(t: string) {
  return REPORT_TYPES.find((rt) => rt.value === t)?.description ?? "";
}

function formatBadge(format: string) {
  const colors: Record<string, { bg: string; fg: string }> = {
    pdf: { bg: "#fee2e2", fg: "#b91c1c" },
    csv: { bg: "#dbeafe", fg: "#1d4ed8" },
    xlsx: { bg: "#dcfce7", fg: "#15803d" },
    print: { bg: "#fef3c7", fg: "#b45309" },
  };
  const c = colors[format] ?? { bg: "#eef1f6", fg: "#4a5a70" };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "9px",
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: "20px",
        letterSpacing: "0.02em",
        background: c.bg,
        color: c.fg,
        textTransform: "uppercase",
      }}
    >
      {format}
    </span>
  );
}

function statusForReport(r: ReportRow) {
  if (r.format === "pdf") return { label: "PDF N/A", color: "#b91c1c", bg: "#fee2e2" };
  if (r.fileUrl) return { label: "Ready", color: "#198340", bg: "#dcfce7" };
  return { label: "Generatable", color: "#1d4ed8", bg: "#dbeafe" };
}

function SummaryStats({ reports }: { reports: ReportRow[] }) {
  const { t } = useTranslation();
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) {
      counts[r.reportType] = (counts[r.reportType] ?? 0) + 1;
    }
    return counts;
  }, [reports]);

  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of reports) {
      counts[r.format] = (counts[r.format] ?? 0) + 1;
    }
    return counts;
  }, [reports]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "16px" }}>
      <div style={{ background: "white", border: "1px solid #e3e9f1", borderRadius: "8px", padding: "14px 16px" }}>
        <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "4px" }}>{t("reports.totalReports")}</div>
        <div style={{ fontFamily: "Manrope", fontSize: "20px", fontWeight: 700, color: "#132238" }}>{reports.length}</div>
      </div>
      <div style={{ background: "white", border: "1px solid #e3e9f1", borderRadius: "8px", padding: "14px 16px" }}>
        <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "4px" }}>{t("reports.highRisk")}</div>
        <div style={{ fontFamily: "Manrope", fontSize: "20px", fontWeight: 700, color: "#c9282b" }}>{typeCounts["high-risk"] ?? 0}</div>
      </div>
      <div style={{ background: "white", border: "1px solid #e3e9f1", borderRadius: "8px", padding: "14px 16px" }}>
        <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "4px" }}>CSV/XLSX</div>
        <div style={{ fontFamily: "Manrope", fontSize: "20px", fontWeight: 700, color: "#15803d" }}>{(formatCounts["csv"] ?? 0) + (formatCounts["xlsx"] ?? 0)}</div>
      </div>
      <div style={{ background: "white", border: "1px solid #e3e9f1", borderRadius: "8px", padding: "14px 16px" }}>
        <div style={{ fontSize: "10px", color: "#718096", fontWeight: 600, marginBottom: "4px" }}>{t("reports.thisMonth")}</div>
        <div style={{ fontFamily: "Manrope", fontSize: "20px", fontWeight: 700, color: "#16b894" }}>
          {reports.filter((r) => {
            const d = new Date(r.createdAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length}
        </div>
      </div>
    </div>
  );
}

function ReportDetailModal({
  
  open,
  onClose,
  report,
  userName,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportRow | null;
  userName: string;
}) {
  const { t } = useTranslation();
  if (!open || !report) return null;
  const status = statusForReport(report);
  const typeDesc = getReportTypeDescription(report.reportType);
  const isPDF = report.format === "pdf";
  const isPrint = report.format === "print";

  const handleDownload = () => {
    window.open(`/api/reports/${report.id}/download`, "_blank");
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: "520px" }}>
        <button className="dialog-close" onClick={onClose}>
          <X size={17} />
        </button>
        <h3>{t("reports.details")}</h3>
        <p>{t("reports.detailsDescription")}</p>
        <div style={{ display: "grid", gap: "12px", marginTop: "8px" }}>
          <DetailRow label={t("reports.reportId")} value={`#${report.id}`} />
          <DetailRow label={t("reports.type")} value={formatReportType(report.reportType)} />
          {typeDesc && (
            <DetailRow label={t("reports.description")} value={typeDesc} />
          )}
          <DetailRow label="Format" value={report.format.toUpperCase()} />
          <DetailRow label="Generated By" value={userName} />
          <DetailRow
            label="Date Created"
            value={new Date(report.createdAt).toLocaleString()}
          />
          <DetailRow label="Status">
            <span
              style={{
                display: "inline-block",
                fontSize: "9px",
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "20px",
                background: status.bg,
                color: status.color,
              }}
            >
              {status.label}
            </span>
          </DetailRow>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "9px", marginTop: "18px" }}>
          {!isPDF ? (
            <button
              className="primary-btn"
              onClick={handleDownload}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {isPrint ? <Printer size={14} /> : <Download size={14} />}
              {isPrint ? "Open Print View" : `Download ${report.format.toUpperCase()}`}
            </button>
          ) : (
            <span style={{ fontSize: "11px", color: "#b91c1c", alignSelf: "center" }}>
              PDF generation not yet implemented
            </span>
          )}
          <button className="outline-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: "11px", color: "#718096", fontWeight: 600 }}>{label}</span>
      {children ?? <span style={{ fontSize: "12px", color: "#334155" }}>{value ?? "\u2014"}</span>}
    </div>
  );
}

function CreateReportModal({
  open,
  onClose,
  onCreate,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { reportType: string; format: string; childId?: string; officerId?: number; startDate?: string; endDate?: string }) => void;
  isPending: boolean;
}) {
  const [reportType, setReportType] = useState("high-risk");
  const [format, setFormat] = useState("csv");
  const [childId, setChildId] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const childrenQuery = trpc.data.children.useQuery();
  const usersQuery = trpc.users.list.useQuery();

  const childrenList = useMemo(() => {
    if (!childrenQuery.data) return [];
    return (childrenQuery.data as any[]).map((c: any) => ({ id: c.childId, label: `${c.childId} — ${c.name ?? "Unknown"}` }));
  }, [childrenQuery.data]);

  const officersList = useMemo(() => {
    if (!usersQuery.data) return [];
    return (usersQuery.data as any[])
      .filter((u: any) => u.role === "nutrition_officer")
      .map((u: any) => ({ id: u.id, label: u.name || u.username || `User #${u.id}` }));
  }, [usersQuery.data]);

  const showChildFilter = reportType === "child-specific";
  const showOfficerFilter = reportType === "officer";
  const showDateFilter = ["daily", "weekly", "monthly"].includes(reportType);
  const isPDF = format === "pdf";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPDF) {
      toast.error("PDF generation is not yet implemented. Please choose CSV, XLSX, or Print.");
      return;
    }
    const data: { reportType: string; format: string; childId?: string; officerId?: number; startDate?: string; endDate?: string } = { reportType, format };
    if (showChildFilter && childId) data.childId = childId;
    if (showOfficerFilter && officerId) data.officerId = Number(officerId);
    if (showDateFilter) {
      if (startDate) data.startDate = startDate;
      if (endDate) data.endDate = endDate;
    }
    onCreate(data);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" style={{ maxWidth: "520px" }}>
        <button className="dialog-close" onClick={onClose}>
          <X size={17} />
        </button>
        <h3>Create New Report</h3>
        <p>Select the report type, filters, and output format to generate a new report.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Report Type
            <select value={reportType} onChange={(e) => { setReportType(e.target.value); setChildId(""); setOfficerId(""); setStartDate(""); setEndDate(""); }}>
              {REPORT_TYPES.map((report) => (
                <option key={report.value} value={report.value}>
                  {report.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: "10px", color: "#718096", marginTop: "-4px", marginBottom: "14px" }}>
            {REPORT_TYPES.find((report) => report.value === reportType)?.description}
          </div>

          {showChildFilter && (
            <label>
              Select Child
              <select value={childId} onChange={(e) => setChildId(e.target.value)} required>
                <option value="">— Choose a child —</option>
                {childrenList.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
          )}

          {showOfficerFilter && (
            <label>
              Select Officer
              <select value={officerId} onChange={(e) => setOfficerId(e.target.value)} required>
                <option value="">— Choose an officer —</option>
                {officersList.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          {showDateFilter && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <label>
                Start Date
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ marginTop: "7px" }} />
              </label>
              <label>
                End Date
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ marginTop: "7px" }} />
              </label>
            </div>
          )}

          <label>
            Output Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMAT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div style={{ fontSize: "10px", color: "#718096", marginTop: "-4px", marginBottom: "14px" }}>
            {FORMAT_OPTIONS.find((f) => f.value === format)?.description}
          </div>
          <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e3e9f1", marginBottom: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
              <span style={{ color: "#718096" }}>Report Type:</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{formatReportType(reportType)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: "#718096" }}>Output Format:</span>
              <span style={{ fontWeight: 600, color: "#334155" }}>{FORMAT_OPTIONS.find((f) => f.value === format)?.label}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "9px" }}>
            <button type="button" className="outline-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={isPending}>
              {isPending ? "Generating..." : "Generate Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ReportsModule() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [detailReport, setDetailReport] = useState<ReportRow | null>(null);

  const utils = trpc.useUtils();

  const reportsQuery = trpc.reports.list.useQuery();
  const usersQuery = trpc.users.list.useQuery();

  const createMutation = trpc.reports.create.useMutation({
    onSuccess: () => {
      toast.success("Report generated and saved.");
      utils.reports.list.invalidate();
      setFormOpen(false);
    },
    onError: (err) => toast.error(err.message || "Unable to generate report."),
  });

  const userMap = useMemo(() => {
    const map: Record<number, string> = {};
    if (usersQuery.data) {
      for (const u of usersQuery.data as any[]) {
        map[u.id] = u.name || u.username || `User #${u.id}`;
      }
    }
    return map;
  }, [usersQuery.data]);

  const reports: ReportRow[] = useMemo(() => {
    if (!reportsQuery.data) return [];
    return (reportsQuery.data as any[]).map((r: any) => ({
      id: r.id,
      reportType: r.reportType,
      generatedBy: r.generatedBy,
      fileUrl: r.fileUrl ?? null,
      format: r.format,
      createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(r.createdAt).toISOString(),
    }));
  }, [reportsQuery.data]);

  const filtered = useMemo(() => {
    if (!query.trim()) return reports;
    const q = query.toLowerCase();
    return reports.filter(
      (r) =>
        r.reportType.toLowerCase().includes(q) ||
        r.format.toLowerCase().includes(q) ||
        (userMap[r.generatedBy] ?? "").toLowerCase().includes(q)
    );
  }, [reports, query, userMap]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const loading = reportsQuery.isLoading;
  const error = reportsQuery.isError;

  return (
    <>
      <div className="panel-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2>Reports</h2>
          <p style={{ fontSize: "12px", color: "#718096", margin: "2px 0 0" }}>
            {loading ? "Loading..." : `${reports.length} report${reports.length !== 1 ? "s" : ""} generated`}
          </p>
        </div>
        <button className="primary-btn" onClick={() => setFormOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <Plus size={14} /> Create Report
        </button>
      </div>

      {loading && <div className="module-state">Loading reports...</div>}

      {error && (
        <div className="module-state error">Unable to load reports. Please try again.</div>
      )}

      {!loading && !error && reports.length === 0 && (
        <div className="module-state" style={{ padding: "48px 20px" }}>
          <FileText size={40} style={{ color: "#c4d2e2", margin: "0 auto 12px" }} />
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>No reports generated</p>
          <p style={{ fontSize: "12px", color: "#718096", marginBottom: "16px" }}>
            Create a report to generate operational insights.
          </p>
          <button className="primary-btn" onClick={() => setFormOpen(true)}>
            <Plus size={14} /> Create Report
          </button>
        </div>
      )}

      {!loading && !error && reports.length > 0 && (
        <>
          <SummaryStats reports={reports} />

          <div className="module-controls">
            <div className="search-bar">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search by type, format, or generator..."
              />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>ID</th>
                  <th>Report Type</th>
                  <th>Format</th>
                  <th>Generated By</th>
                  <th>Date Created</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right", minWidth: "160px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((report) => {
                  const status = statusForReport(report);
                  const isPDF = report.format === "pdf";
                  const isPrint = report.format === "print";
                  return (
                    <tr key={report.id}>
                      <td style={{ fontWeight: 600, fontSize: "12px" }}>#{report.id}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <FileText size={14} style={{ color: "#718096" }} />
                          <div>
                            <span style={{ fontSize: "12px", fontWeight: 500 }}>{formatReportType(report.reportType)}</span>
                            <div style={{ fontSize: "10px", color: "#718096", marginTop: "1px" }}>
                              {getReportTypeDescription(report.reportType)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{formatBadge(report.format)}</td>
                      <td style={{ fontSize: "12px" }}>{userMap[report.generatedBy] ?? `User #${report.generatedBy}`}</td>
                      <td style={{ fontSize: "12px" }}>
                        {new Date(report.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: "9px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "20px",
                            background: status.bg,
                            color: status.color,
                          }}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions" style={{ justifyContent: "flex-end", gap: "6px" }}>
                          {!isPDF ? (
                            <button
                              className="primary-btn"
                              style={{ fontSize: "10px", padding: "5px 10px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => window.open(`/api/reports/${report.id}/download`, "_blank")}
                              title={isPrint ? "Open Print View" : `Download ${report.format.toUpperCase()}`}
                            >
                              {isPrint ? <Printer size={12} /> : <Download size={12} />}
                              {isPrint ? "Print" : `Download ${report.format.toUpperCase()}`}
                            </button>
                          ) : (
                            <span style={{ fontSize: "10px", color: "#b91c1c" }}>PDF N/A</span>
                          )}
                          <button className="table-action" onClick={() => setDetailReport(report)}>
                            <Eye size={12} /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button className="secondary-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} /> Previous
              </button>
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <button className="secondary-btn" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      <CreateReportModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreate={(data) => createMutation.mutate(data as any)}
        isPending={createMutation.isPending}
      />

      <ReportDetailModal
        open={Boolean(detailReport)}
        onClose={() => setDetailReport(null)}
        report={detailReport}
        userName={detailReport ? (userMap[detailReport.generatedBy] ?? `User #${detailReport.generatedBy}`) : ""}
      />
    </>
  );
}
