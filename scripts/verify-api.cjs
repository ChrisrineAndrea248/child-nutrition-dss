const http = require("http");

// Simulate how Vercel's bridge loads the function: require() and call it.
const handler = require(require("path").join(__dirname, "..", "api", "index.js"));
if (typeof handler !== "function") {
  console.error("FAIL: module.exports is not a function:", typeof handler);
  process.exit(1);
}

const server = http.createServer((req, res) => handler(req, res));
server.listen(3100, async () => {
  const base = "http://127.0.0.1:3100";

  // 1. Login mutation (superjson wire format used by tRPC httpBatchLink)
  const loginRes = await fetch(base + "/api/trpc/auth.login?batch=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: { username: "admin", password: "Admin@123" } } }),
  });
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const loginBody = await loginRes.text();
  console.log("LOGIN status:", loginRes.status);
  console.log("LOGIN content-type:", loginRes.headers.get("content-type"));
  console.log("LOGIN body:", loginBody.slice(0, 300));
  console.log("LOGIN sets cookie:", setCookie.split(";")[0]);

  // 2. Wrong password must be a clean tRPC error, not a crash
  const badRes = await fetch(base + "/api/trpc/auth.login?batch=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ 0: { json: { username: "admin", password: "wrong" } } }),
  });
  console.log("BAD-LOGIN status:", badRes.status, "body:", (await badRes.text()).slice(0, 200));

  // 3. auth.me with the session cookie
  const token = setCookie.split(";")[0].split("=").slice(1).join("=");
  const meRes = await fetch(base + "/api/trpc/auth.me?batch=1&input=" + encodeURIComponent(JSON.stringify({"0":{"json":null,"meta":{"values":["undefined"]}}})), {
    headers: { cookie: `app_session_id=${token}` },
  });
  console.log("ME status:", meRes.status, "body:", (await meRes.text()).slice(0, 300));

  // 4. OAuth callback route exists (should be JSON 400 without params)
  const cbRes = await fetch(base + "/api/oauth/callback");
  console.log("OAUTH-CB status:", cbRes.status, "body:", (await cbRes.text()).slice(0, 120));

  server.close();
  const ok = loginRes.status === 200 && setCookie.startsWith("app_session_id=") && meRes.status === 200 && badRes.status === 401;
  console.log(ok ? "ALL CHECKS PASSED" : "CHECKS FAILED");
  process.exit(ok ? 0 : 1);
});
