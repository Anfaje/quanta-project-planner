import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

/**
 * Wrap authenticated pages. Behavior:
 *   - While /me is loading → show centered spinner (avoids flash of login page).
 *   - If unauthenticated → redirect to /login, preserving the target so the
 *     login page can bounce the user back after success.
 *   - If authenticated → render children.
 */

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { me, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" color="indigo" />
      </div>
    );
  }

  if (!me) {
    // Preserve where they were headed so /login can return them after auth.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
