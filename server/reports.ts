import ExcelJS from "exceljs";
import {
  listPredictions,
  listChildren,
  listUsers,
  getLatestModelVersion,
  getChildByChildId,
} from "./db";

export type ReportFilters = {
  childId?: string;
  officerId?: number;
  startDate?: string;
  endDate?: string;
};

type ReportData = {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
};

function filterByDateRange(
  rows: any[],
  startDate?: string,
  endDate?: string
): any[] {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  return rows.filter((r) => {
    const d = new Date(r.createdAt);
    if (start && d < start) return false;
    if (end) {
      const endIncl = new Date(end);
      endIncl.setHours(23, 59, 59, 999);
      if (d > endIncl) return false;
    }
    return true;
  });
}

function getDefaultDateRange(reportType: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  switch (reportType) {
    case "daily":
      start.setHours(0, 0, 0, 0);
      break;
    case "weekly":
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "monthly":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setFullYear(now.getFullYear() - 1);
      break;
  }
  return { start, end };
}

async function getReportData(
  reportType: string,
  filters: ReportFilters
): Promise<ReportData> {
  const allPredictions = await listPredictions();
  const allChildren = await listChildren();
  const allUsers = await listUsers();

  const childMap = new Map<number, any>();
  for (const c of allChildren) childMap.set(c.id, c);

  const userMap = new Map<number, any>();
  for (const u of allUsers) userMap.set(u.id, u);

  switch (reportType) {
    case "high-risk": {
      const highRisk = allPredictions.filter(
        (p) => p.riskLevel === "High" || Number(p.probability) >= 0.5
      );
      return {
        title: "High Risk Cases Report",
        subtitle: `Children flagged as high risk — ${highRisk.length} case(s)`,
        headers: [
          "Prediction ID",
          "Child ID",
          "Age (months)",
          "Sex",
          "Prediction",
          "Risk Level",
          "Probability",
          "Risk Score",
          "Date",
        ],
        rows: highRisk.map((p) => {
          const child = childMap.get(p.childId);
          return [
            p.predictionId,
            child?.childId ?? `Child #${p.childId}`,
            child?.ageMonths ?? "—",
            child?.sex ?? "—",
            p.prediction,
            p.riskLevel,
            `${(Number(p.probability) * 100).toFixed(1)}%`,
            p.riskScore,
            new Date(p.createdAt).toLocaleDateString(),
          ];
        }),
      };
    }
    case "daily":
    case "weekly":
    case "monthly": {
      const { start, end } = getDefaultDateRange(reportType);
      const sDate = filters.startDate ? new Date(filters.startDate) : start;
      const eDate = filters.endDate ? new Date(filters.endDate) : end;
      const preds = filterByDateRange(allPredictions, sDate.toISOString(), eDate.toISOString());
      const label =
        reportType === "daily"
          ? "Daily"
          : reportType === "weekly"
            ? "Weekly"
            : "Monthly";
      return {
        title: `${label} Summary Report`,
        subtitle: `${preds.length} assessment(s) from ${sDate.toLocaleDateString()} to ${eDate.toLocaleDateString()}`,
        headers: [
          "Prediction ID",
          "Child ID",
          "Prediction",
          "Risk Level",
          "Probability",
          "Risk Score",
          "Date",
        ],
        rows: preds.map((p) => {
          const child = childMap.get(p.childId);
          return [
            p.predictionId,
            child?.childId ?? `Child #${p.childId}`,
            p.prediction,
            p.riskLevel,
            `${(Number(p.probability) * 100).toFixed(1)}%`,
            p.riskScore,
            new Date(p.createdAt).toLocaleDateString(),
          ];
        }),
      };
    }
    case "child-specific": {
      const childId = filters.childId;
      if (!childId) {
        return {
          title: "Child-Specific Report",
          subtitle: "No child selected",
          headers: ["Info"],
          rows: [["Please select a child to generate this report."]],
        };
      }
      const child = await getChildByChildId(childId);
      const preds = allPredictions.filter((p) => {
        const c = childMap.get(p.childId);
        return c?.childId === childId;
      });
      return {
        title: `Child Report — ${childId}`,
        subtitle: child
          ? `${child.name ?? "Unknown"} | ${child.ageMonths ?? "?"} months | ${child.sex ?? "?"}`
          : `Child ${childId} — ${preds.length} assessment(s)`,
        headers: [
          "Prediction ID",
          "Prediction",
          "Risk Level",
          "Probability",
          "Risk Score",
          "Date",
        ],
        rows: preds.map((p) => [
          p.predictionId,
          p.prediction,
          p.riskLevel,
          `${(Number(p.probability) * 100).toFixed(1)}%`,
          p.riskScore,
          new Date(p.createdAt).toLocaleDateString(),
        ]),
      };
    }
    case "officer": {
      const officerId = filters.officerId;
      const preds = officerId
        ? allPredictions.filter((p) => p.officerId === officerId)
        : allPredictions;
      const officer = officerId ? userMap.get(officerId) : null;
      return {
        title: "Officer Activity Report",
        subtitle: officer
          ? `${officer.name ?? officer.username} — ${preds.length} assessment(s)`
          : `All officers — ${preds.length} assessment(s)`,
        headers: [
          "Prediction ID",
          "Child ID",
          "Prediction",
          "Risk Level",
          "Probability",
          "Date",
        ],
        rows: preds.map((p) => {
          const child = childMap.get(p.childId);
          return [
            p.predictionId,
            child?.childId ?? `Child #${p.childId}`,
            p.prediction,
            p.riskLevel,
            `${(Number(p.probability) * 100).toFixed(1)}%`,
            new Date(p.createdAt).toLocaleDateString(),
          ];
        }),
      };
    }
    case "model-performance": {
      const model = await getLatestModelVersion();
      return {
        title: "Model Performance Report",
        subtitle: model
          ? `Version: ${model.version} | Trained: ${model.lastTrainedAt ? new Date(model.lastTrainedAt).toLocaleDateString() : "—"}`
          : "No model data available",
        headers: ["Metric", "Value"],
        rows: model
          ? [
              ["Version", model.version ?? "—"],
              ["Accuracy", model.accuracy != null ? `${(Number(model.accuracy) * 100).toFixed(2)}%` : "—"],
              ["Precision", model.precision != null ? `${(Number(model.precision) * 100).toFixed(2)}%` : "—"],
              ["Recall", model.recall != null ? `${(Number(model.recall) * 100).toFixed(2)}%` : "—"],
              ["F1 Score", model.f1Score != null ? `${(Number(model.f1Score) * 100).toFixed(2)}%` : "—"],
              ["ROC AUC", model.rocAuc != null ? `${(Number(model.rocAuc) * 100).toFixed(2)}%` : "—"],
              ["Training Data Size", model.trainingDataSize ?? "—"],
              ["Testing Data Size", model.testingDataSize ?? "—"],
            ]
          : [["No model data available", "—"]],
      };
    }
    default:
      return {
        title: "Report",
        subtitle: "",
        headers: ["Info"],
        rows: [["Unknown report type."]],
      };
  }
}

function escapeCSV(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function generateCSV(
  reportType: string,
  filters: ReportFilters
): Promise<Buffer> {
  const data = await getReportData(reportType, filters);
  const lines: string[] = [];
  lines.push(data.title);
  lines.push(data.subtitle);
  lines.push("");
  lines.push(data.headers.map(escapeCSV).join(","));
  for (const row of data.rows) {
    lines.push(row.map(escapeCSV).join(","));
  }
  return Buffer.from(lines.join("\n"), "utf-8");
}

export async function generateXLSX(
  reportType: string,
  filters: ReportFilters
): Promise<Buffer> {
  const data = await getReportData(reportType, filters);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  sheet.addRow([data.title]);
  sheet.mergeCells(1, 1, 1, data.headers.length);
  const titleCell = sheet.getCell("A1");
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center" };

  sheet.addRow([data.subtitle]);
  sheet.mergeCells(2, 1, 2, data.headers.length);
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF666666" } };
  subtitleCell.alignment = { horizontal: "center" };

  sheet.addRow([]);

  const headerRow = sheet.addRow(data.headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1265D8" },
    };
    cell.alignment = { horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  for (const row of data.rows) {
    sheet.addRow(row);
  }

  sheet.columns.forEach((col) => {
    let maxLen = 10;
    if (col.eachCell) {
      col.eachCell({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > maxLen) maxLen = len;
      });
    }
    col.width = Math.min(maxLen + 4, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generatePrintHTML(
  reportType: string,
  filters: ReportFilters
): Promise<Buffer> {
  const data = await getReportData(reportType, filters);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${data.title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1a1a1a; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #1265d8; color: #fff; padding: 8px 10px; text-align: left; font-weight: 600; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 20px; font-size: 10px; color: #999; text-align: center; }
  @media print {
    body { padding: 0; }
    th { background: #1265d8 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<h1>${data.title}</h1>
<div class="subtitle">${data.subtitle}</div>
<table>
<thead><tr>${data.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${data.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
</table>
<div class="footer">Generated ${new Date().toLocaleString()} — Child Nutrition DSS</div>
</body>
</html>`;
  return Buffer.from(html, "utf-8");
}
