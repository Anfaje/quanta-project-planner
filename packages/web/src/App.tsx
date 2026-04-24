import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage, MfaVerifyPage } from "./pages/LoginPage";
import { MfaSetupPage } from "./pages/MfaSetupPage";
import { SignupPage } from "./pages/SignupPage";
import { AcceptInvitePage } from "./pages/AcceptInvitePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsListPage } from "./pages/ProjectsListPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectWizardPage } from "./pages/ProjectWizardPage";
import { AdminConsolePage } from "./pages/AdminConsolePage";

/**
 * Route table for Quanta.
 *
 * Public routes — login, signup, MFA setup/verify, invite accept — don't
 * wrap in ProtectedRoute. They handle their own unauthenticated flows.
 *
 * App pages are wrapped individually rather than via a shared parent route
 * so the auth pages keep their own chrome (AuthShell) and the app pages
 * use theirs (Layout).
 *
 * "/" redirects to /dashboard; ProtectedRoute bounces unauthenticated users
 * to /login with state.from so they land back where they wanted after MFA.
 */

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* ── Public auth routes ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/mfa" element={<MfaVerifyPage />} />
        <Route path="/login/mfa-setup" element={<MfaSetupPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        {/* ── Protected app routes ── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <ProjectsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/new"
          element={
            <ProtectedRoute>
              <ProjectWizardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedRoute>
              <ProjectDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminConsolePage />
            </ProtectedRoute>
          }
        />

        {/* ── Root + fallback ── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
