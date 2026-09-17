import express from "express";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";
import { ensureAdminSeed, expireOldPendingAccounts, migrateChildIdPadding } from "../db";
import { sdk } from "./sdk";

export function createApp() {
  const app = express();

  // System initialization: guarantee exactly one Administrator account
  // exists (username "Admin", forced password change on first login).
  // Safe/idempotent to run on every boot — no-ops once an admin exists.
  ensureAdminSeed().catch((error) => {
    console.error("[Startup] Failed to seed initial Administrator account:", error);
  });

  // Auto-expire pending registrations older than 30 days on startup.
  expireOldPendingAccounts().catch((error) => {
    console.error("[Startup] Failed to expire old pending accounts:", error);
  });

  // Migrate narrow childId values (1-2 digits) to 5-digit zero-padded format.
  // Idempotent — safe to run on every boot, no-ops after first run.
  migrateChildIdPadding().catch((error) => {
    console.error("[Startup] Failed to migrate child ID padding:", error);
  });

  // Body parser — reject oversized payloads before they reach any handler.
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ limit: "100kb", extended: true }));

  // General baseline rate limiter for all /trpc routes.
  // Generous: 200 requests per IP per 15 minutes — catches automated abuse
  // while allowing legitimate high-volume use (e.g. dashboards, reports).
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please wait a moment and try again." },
    validate: false,
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ─── Report file download route ────────────────────────────────
  // Auto-generates files for old reports that don't have one yet.
  app.get("/api/reports/:id/download", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const reportId = Number(req.params.id);
    if (isNaN(reportId)) {
      res.status(400).json({ error: "Invalid report ID" });
      return;
    }

    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: "Database not available" });
      return;
    }

    const [rows] = await db.query<any[]>(
      "SELECT * FROM `reports` WHERE `id` = ? LIMIT 1",
      [reportId]
    );
    const report = rows[0];
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }

    // Skip PDF — not implemented
    if (report.format === "pdf") {
      res.status(400).json({ error: "PDF generation is not yet implemented." });
      return;
    }

    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const reportsDir = path.join(process.cwd(), "data", "reports");
    await fs.mkdir(reportsDir, { recursive: true });

    // If no fileUrl or file missing from disk, generate now
    let filename = report.fileUrl;
    let filePath = filename ? path.join(reportsDir, filename) : null;
    let needsGenerate = !filename;
    if (filename) {
      try {
        await fs.access(filePath!);
      } catch {
        needsGenerate = true;
      }
    }

    if (needsGenerate) {
      const { generateCSV, generateXLSX, generatePrintHTML } = await import("../reports");
      const ext = report.format === "print" ? "html" : report.format;
      const safeType = (report.reportType ?? "report").replace(/[^a-zA-Z0-9]/g, "_");
      filename = `${safeType}_${reportId}.${ext}`;
      filePath = path.join(reportsDir, filename);

      let content: Buffer;
      if (report.format === "csv") {
        content = await generateCSV(report.reportType, {});
      } else if (report.format === "xlsx") {
        content = await generateXLSX(report.reportType, {});
      } else {
        content = await generatePrintHTML(report.reportType, {});
      }
      await fs.writeFile(filePath, content);

      // Save the fileUrl back to the DB
      await db.query("UPDATE `reports` SET `fileUrl` = ? WHERE `id` = ?", [filename, reportId]);
    }

    const ext = path.extname(filename!).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".csv": "text/csv",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".html": "text/html",
      ".pdf": "application/pdf",
    };
    const contentType = contentTypes[ext] ?? "application/octet-stream";
    const disposition = ext === ".html" ? "inline" : "attachment";

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${filename}"`
    );

    const { createReadStream } = await import("node:fs");
    createReadStream(filePath!).pipe(res);
  });

  // tRPC API — with general rate limiting
  app.use(
    "/api/trpc",
    generalLimiter,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // development mode uses Vite; Vercel serves the static client directly
  if (process.env.NODE_ENV !== "development" && !process.env.VERCEL) {
    serveStatic(app);
  }

  return app;
}
