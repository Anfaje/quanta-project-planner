import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { DashboardPage } from "./DashboardPage";
import { renderWithProviders, TEST_USER_IC, TEST_USER_AA } from "../test/render";
import type { Dashboard } from "../lib/types";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      download: vi.fn(),
    },
  };
});

// Mock AuthContext so useMe returns a specific role profile.
const meRef = { current: TEST_USER_IC };
vi.mock("../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ me: meRef.current, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useMe: () => meRef.current,
}));

import { api } from "../lib/api";

beforeEach(() => {
  vi.clearAllMocks();
  meRef.current = TEST_USER_IC;
});

// Helper to build a Dashboard payload — sections array is the only thing
// the page iterates on, so each test specifies just the sections it cares
// about and stubs the matching data block.
function buildDashboard(overrides: Partial<Dashboard>): Dashboard {
  return {
    user: { id: "u-ic", name: "Ivy", email: "ic@example.com", roles: ["IC"], primaryBuId: "bu-1" },
    sections: [],
    ...overrides,
  };
}

describe("DashboardPage", () => {
  it("renders IC name in the greeting", async () => {
    (api.get as any).mockResolvedValueOnce(buildDashboard({ sections: [] }));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/Hello, Ivy/)).toBeInTheDocument();
  });

  it("renders the my_hours section when present and matches API content", async () => {
    (api.get as any).mockResolvedValueOnce(
      buildDashboard({
        sections: ["my_hours"],
        myHours: [
          {
            projectId: "p1",
            projectName: "Brand Refresh 2026",
            projectCode: "BRF-2026",
            projectStatus: "active",
            projectRole: "iOS Dev",
            currentWeek: 3,
            currentWeekPlanned: 20,
            currentWeekActual: 12,
            currentWeekLocked: false,
            unfilledWeeks: 0,
            totalPlanned: 240,
            totalActual: 140,
          },
        ],
      })
    );
    renderWithProviders(<DashboardPage />);

    // Title from MyHoursSection + a row showing the project name.
    expect(await screen.findByText(/Brand Refresh 2026/)).toBeInTheDocument();
    expect(screen.getByText("BRF-2026")).toBeInTheDocument();
    // Header reads "Week 4" because component is 0-indexed +1.
    expect(screen.getByText(/Week 4/)).toBeInTheDocument();
  });

  it("preserves API-chosen section ordering", async () => {
    meRef.current = TEST_USER_AA;
    // Intentionally weird order — bu_health LAST, my_hours FIRST.
    (api.get as any).mockResolvedValueOnce(
      buildDashboard({
        sections: ["my_hours", "platform_admin", "bu_health"],
        myHours: [],
        platformAdmin: {
          userCount: 5,
          activeUserCount: 4,
          domainCount: 2,
          buCount: 3,
          accountCount: 1,
          recentAudit: [],
        },
        buHealth: {
          businessUnit: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
          headcount: { active: 4, target: null },
          atRiskProjectCount: 0,
          totalProjects: 3,
        },
      })
    );

    const { container } = renderWithProviders(<DashboardPage />);

    // We assert ordering by reading the section titles top-to-bottom and
    // checking their position in the document. The DOM order should follow
    // the API sections array — first my_hours (which renders an EmptyState
    // because rows is empty), then Platform, then BU health.
    await screen.findByText(/Platform/); // wait for render
    const html = container.innerHTML;
    const platformIdx = html.indexOf("Platform");
    const buHealthIdx = html.indexOf("BU health");
    expect(platformIdx).toBeLessThan(buHealthIdx);
  });

  it("shows an error alert when the dashboard query fails", async () => {
    (api.get as any).mockRejectedValueOnce(new Error("boom"));
    renderWithProviders(<DashboardPage />);

    expect(await screen.findByText(/couldn't load your dashboard/i)).toBeInTheDocument();
  });
});
