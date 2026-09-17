export const ENV = {
  appId: process.env.VITE_APP_ID ?? "nutrition-dss",
  cookieSecret: process.env.JWT_SECRET ?? "dev-local-secret-change-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Email (SMTP via Gmail)
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  adminEmail: process.env.ADMIN_EMAIL ?? "lojongchristine248@gmail.com",
  emailFrom: process.env.EMAIL_FROM ?? "Child Undernutrition DSS <noreply@nutrition-dss.local>",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
};
