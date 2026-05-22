import { ReactElement, ReactNode } from "react";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import type { Me } from "../lib/types";

/**
 * Test render helper.
 *
 * Wraps a component in the minimum context it needs to behave like it does
 * in the real app:
 *   - QueryClientProvider with retry disabled + zero staleTime so mocked
 *     fetches return synchronously and tests don't flake on background
 *     refetches.
 *   - MemoryRouter (with optional initialEntries for /:param routes)
 *   - For pages that call useMe(), the caller passes `me` and we mock the
 *     AuthContext module so useMe + useAuth return that value.
 *
 * For pages that mount under a parameterised route, pass `path` to register
 * a matching <Route>; otherwise the component renders at "/".
 */

interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial URL — defaults to "/". For /:id routes, pass e.g. "/projects/p1". */
  route?: string;
  /** Route pattern to match the URL against. */
  path?: string;
  /** Pre-seeded /me value. Defaults to a basic IC user. */
  me?: Me | null;
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(ui: ReactElement, options: CustomRenderOptions = {}) {
  const { route = "/", path, me, ...rtlOptions } = options;
  const queryClient = createTestQueryClient();

  // Seed the /me query result so useAuth + useMe see the test user without
  // a fetch round-trip.
  if (me !== undefined) {
    queryClient.setQueryData(["me"], me);
  }

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={children} />
          </Routes>
        ) : (
          children
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );

  const result = rtlRender(ui, { wrapper: Wrapper, ...rtlOptions });
  return { ...result, queryClient };
}

/** Default IC user — sensible baseline for tests that need a logged-in caller. */
export const TEST_USER_IC: Me = {
  id: "u-ic",
  email: "ic@example.com",
  name: "Ivy Coder",
  roles: ["IC"],
  projectRoles: ["iOS Dev"],
  primaryBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
  financialAccess: false,
  managedAccounts: [],
  dashboardSections: ["my_hours"],
};

export const TEST_USER_PM: Me = {
  id: "u-pm",
  email: "pm@example.com",
  name: "Penelope Manager",
  roles: ["PM"],
  projectRoles: ["PM"],
  primaryBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
  financialAccess: false,
  managedAccounts: [],
  dashboardSections: ["project_health"],
};

export const TEST_USER_AA: Me = {
  id: "u-aa",
  email: "aa@example.com",
  name: "Anna Admin",
  roles: ["AA"],
  projectRoles: [],
  primaryBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
  financialAccess: true,
  managedAccounts: [],
  dashboardSections: ["platform_admin"],
};

/**
 * Convenience to silence ResizeObserver / matchMedia errors when Recharts
 * mounts in happy-dom (it expects browser APIs that aren't shimmed by
 * default). Call once per test file that uses Recharts.
 */
export function mockBrowserAPIs() {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
  }
  if (typeof globalThis.matchMedia === "undefined") {
    (globalThis as any).matchMedia = () =>
      ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as any);
  }
  // Recharts uses window dimensions; provide stable values so charts render
  // at a deterministic size in tests.
  Object.defineProperty(window, "innerWidth", { writable: true, value: 1024 });
  Object.defineProperty(window, "innerHeight", { writable: true, value: 768 });
}

/** Helper for tests that need vi.fn() returning a resolved promise. */
export function mockResolved<T>(value: T) {
  return vi.fn().mockResolvedValue(value);
}

/** Helper for tests that need vi.fn() returning a rejected promise. */
export function mockRejected(err: unknown) {
  return vi.fn().mockRejectedValue(err);
}
