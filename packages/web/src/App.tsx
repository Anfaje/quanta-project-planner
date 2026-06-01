import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage, MfaVerifyPage } from "./pages/LoginPage";
import { MfaSetupPage } from "./pages/MfaSetupPage";
import { SignupPage } from "./pages/SignupPage";
import { WelcomePage } from "./pages/WelcomePage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsListPage } from "./pages/ProjectsListPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { Spinner } from "./components/ui";

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
 *
 * ## Code-splitting
 *
 * Pages that are heavy AND not on the hot path for ICs are lazy-loaded so
 * an IC who only ever visits /dashboard and /projects/:id doesn't have to
 * download the wizard, the admin console, or the invite-accept page. The
 * Suspense fallback is a centered spinner inside each route's render
 * target, matching what ProtectedRoute already shows during /me load so
 * the transition is visually identical.
 */

const ProjectWizardPage = lazy(() =>
  import("./pages/ProjectWizardPage").then((m) => ({ default: m.ProjectWizardPage }))
);
const AdminConsolePage = lazy(() =>
  import("./pages/AdminConsolePage").then((m) => ({ default: m.AdminConsolePage }))
);
const AcceptInvitePage = lazy(() =>
  import("./pages/AcceptInvitePage").then((m) => ({ default: m.AcceptInvitePage }))
);

/** Shared Suspense fallback. Matches ProtectedRoute's loading look. */
function PageFallback() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-50"
      role="status"
      aria-label="Loading page"
    >
      <Spinner size="lg" color="indigo" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ── Public auth routes ── */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mfa" element={<MfaVerifyPage />} />
          <Route path="/login/mfa-setup" element={<MfaSetupPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
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
      </Suspense>
    </AuthProvider>
  );
}
