import { useState } from "react";
import { Route, Switch, useLocation, useRoute } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Home, LoginPage, PredictionForm, GenericModule, ForcedPasswordChange, Shell } from "./pages/Home";
import { RiskProfile } from "./pages/RiskProfile";
import ProfilePanel from "./components/ProfilePanel";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./_core/hooks/useAuth";
import { getVisibleNavItems, type Role } from "@shared/permissions";
import { useTranslation } from "react-i18next";

function AccessDenied() {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Manrope, sans-serif", color: "#334155" }}>
      <div style={{ fontSize: "48px", marginBottom: "16px" }}>&#128274;</div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>{t("app.accessDenied")}</h1>
      <p style={{ fontSize: "13px", color: "#718096", marginBottom: "20px" }}>{t("app.accessDeniedDetail")}</p>
      <a href="/dashboard" style={{ padding: "8px 16px", background: "#1265d8", color: "white", borderRadius: "6px", textDecoration: "none", fontSize: "13px", fontWeight: 600 }}>{t("app.returnDashboard")}</a>
    </div>
  );
}

function HistoricalResultRoute() {
  const [, params] = useRoute("/prediction/results/:predictionId");
  const predictionId = params?.predictionId ?? "";
  return <RiskProfile predictionId={predictionId} />;
}

function ProfilePage() {
  const { t } = useTranslation();
  const { logout: authLogout } = useAuth();
  const logout = async () => { try { await authLogout(); } catch { /* best effort */ } window.location.href = "/"; };
  return (
    <Shell title={t("app.profile")} subtitle={t("app.profileSubtitle")} onLogout={logout}>
      <ProfilePanel />
    </Shell>
  );
}

function AppRouter() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [lastResult, setLastResult] = useState<any>(null);
  const { loading, isAuthenticated, user, logout: authLogout } = useAuth();
  const authenticated = isAuthenticated;
  const role = (user?.role as Role) ?? "nutrition_officer";
  const visibleNavItems = getVisibleNavItems(role);
  const visiblePaths = new Set(visibleNavItems.map((item) => item.path));

  const logout = async () => { try { await authLogout(); } catch { /* best effort */ } window.location.href = "/"; };
  const loginScreen = <LoginPage />;

  const protectedRoute = (content: React.ReactNode) => {
    if (loading) return <div className="auth-loading">{t("app.checkingSession")}</div>;
    if (!authenticated) return loginScreen;
    return content;
  };

  const permittedRoute = (content: React.ReactNode, path: string) => {
    if (loading) return <div className="auth-loading">{t("app.checkingSession")}</div>;
    if (!authenticated) return loginScreen;
    if (!visiblePaths.has(path)) return <AccessDenied />;
    return content;
  };

  if (loading) return <div className="auth-loading">{t("app.checkingSession")}</div>;

  // Blocking gate: the seeded Administrator (and anyone flagged by an admin
  // password reset) must set a new password before reaching any other page.
  if (authenticated && (user as any)?.mustChangePassword) {
    return <ForcedPasswordChange />;
  }

  return <Switch>
    <Route path="/">{authenticated ? <Home onLogout={logout} /> : loginScreen}</Route>
    <Route path="/dashboard">{protectedRoute(<Home onLogout={logout} />)}</Route>
    <Route path="/profile">{protectedRoute(<ProfilePage />)}</Route>
    <Route path="/prediction/new">{permittedRoute(<PredictionForm onComplete={(result: any) => { setLastResult(result); navigate(`/prediction/results/${result.predictionId}`); }} />, "/prediction/new")}</Route>
    <Route path="/prediction/results/:predictionId">{protectedRoute(<HistoricalResultRoute />)}</Route>
    <Route path="/prediction/results">{protectedRoute(<RiskProfile />)}</Route>
    <Route path="/history">{permittedRoute(<GenericModule type="history" />, "/history")}</Route>
    <Route path="/reports">{permittedRoute(<GenericModule type="reports" />, "/reports")}</Route>
    <Route path="/data">{permittedRoute(<GenericModule type="data" />, "/data")}</Route>
    <Route path="/model">{permittedRoute(<GenericModule type="model" />, "/model")}</Route>
    <Route path="/users">{permittedRoute(<GenericModule type="users" />, "/users")}</Route>
    <Route path="/settings">{permittedRoute(<GenericModule type="settings" />, "/settings")}</Route>
    <Route path="/audit">{permittedRoute(<GenericModule type="audit" />, "/audit")}</Route>
    <Route>{loginScreen}</Route>
  </Switch>;
}

export { getVisibleNavItems };
export type { Role };
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><AppRouter /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
