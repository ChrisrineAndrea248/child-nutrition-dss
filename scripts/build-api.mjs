import { build } from "esbuild";

// Bundles the serverless API entrypoint into a single self-contained CJS file
// at api/index.js so Vercel can deploy it as /api/index without relying on any
// runtime dependency resolution or path-alias support.
await build({
  entryPoints: ["server/api-entry.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  tsconfig: "tsconfig.json",
  legalComments: "none",
  sourcemap: false,
  logLevel: "info",
  footer: {
    js: 'if (module.exports && typeof module.exports.default === "function") { module.exports = module.exports.default; }',
  },
});
