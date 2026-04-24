import { createContext, useContext, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Me } from "../lib/types";

/**
 * Auth context.
 *
 * - `me` is undefined while loading, null when unauthenticated, Me on success.
 * - Consumers using this state to gate rendering should wrap routes with
 *   <ProtectedRoute>, which handles the loading/unauth redirects.
 * - After a login succeeds, call `refresh()` to re-fetch /api/me; after
 *   logout, call `clear()` so cached data for the old user is dropped before
 *   navigating.
 */

interface AuthState {
  me: Me | null | undefined;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const value: AuthState = {
    me: data,
    isLoading,
    refresh: async () => {
      await refetch();
    },
    logout: async () => {
      try {
        await api.post("/api/auth/logout");
      } catch {
        // Server-side failure still forces the client into a logged-out state.
      }
      qc.clear();
      await refetch();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Convenience guard — throws if called before /me resolves to a user. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error("useMe used outside an authenticated route");
  return me;
}
