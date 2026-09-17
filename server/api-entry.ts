import { createApp } from "./_core/app";

// Serverless entrypoint (Vercel). The Express app is callable as
// (req, res), which is the shape the platform expects from the handler.
const app = createApp();

export default app;
