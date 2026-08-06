import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDetailPage } from "./ProjectDetailPage";
import { renderWithProviders } from "../test/render";
import type { Me, ProjectDetail } from "../lib/types";

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

// Mutable holder so each test can choose who the current user is.
const h = vi.hoisted(() => ({ me: null as unknown as Me }));
vi.mock("../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ me: h.me, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useMe: () => h.me,
}));

import { api } from "../lib/api";

function makeMe(over: Partial<Me>): Me {
  return {
    id: "u-x",
    email: "x@e.com",
    name: "X Person",
    roles: ["PM"],
    projectRoles: [],
    primaryBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
    financialAccess: false,
    managedAccounts: [],
    dashboardSections: [],
    ...over,
  };
}

function detail(opts: {
  project?: Partial<ProjectDetail["project"]>;
  capabilities?: Partial<ProjectDetail["capabilities"]>;
  assignments?: ProjectDetail["assignments"];
} = {}): ProjectDetail {
  return {
    project: {
      id: "p-draft",
      name: "Spring Campaign",
      projectCode: "DRF-1",
      status: "draft",
      pricingModel: "time_and_materials",
      fixedPrice: null,
      description: null,
      rejectionNote: null,
      rejectionAt: null,
      startDate: "2026-03-01",
      endDate: "2026-03-29",
      contingencyPct: 0.15,
      totalWeeks: 4,
      account: { id: "a1", code: "MER", name: "Meridian" },
      owningBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
      sharedWithBus: [],
      reviewers: [],
      createdBy: { id: "u-owner", name: "Owner Person", email: "owner@e.com" },
      createdAt: "2026-03-01",
      updatedAt: "2026-03-02",
      baseline: null,
      ...(opts.project ?? {}),
    },
    assignments: opts.assignments ?? [],
    financials: { totalPlannedHours: 100, totalActualHours: 0, eacHours: 100 },
    capabilities: {
      canManage: true,
      canManagePlan: true,
      canLockWeeks: false,
      isDraft: true,
      canApproveDraft: false,
      canManageReviewers: false,
      ...(opts.capabilities ?? {}),
    },
  };
}

function mockGet(d: ProjectDetail) {
  (api.get as any).mockImplementation((url: string) => {
    if (url === "/api/projects/p-draft") return Promise.resolve(d);
    if (url === "/api/admin/users") return Promise.resolve({ users: [] });
    throw new Error(`Unexpected URL ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProjectDetailPage — draft workflow", () => {
  it("an approver sees Approve/Reject and approving calls the API", async () => {
    h.me = makeMe({ id: "u-bul", roles: ["BUL"] }); // not the owner
    mockGet(detail({ capabilities: { canApproveDraft: true } }));
    (api.post as any).mockResolvedValue({});

    renderWithProviders(<ProjectDetailPage />, {
      route: "/projects/p-draft",
      path: "/projects/:id",
    });

    const approveBtn = await screen.findByRole("button", { name: /^Approve$/i });
    expect(screen.getByRole("button", { name: /^Reject$/i })).toBeInTheDocument();

    // Approve → confirm dialog → confirm (scoped to the dialog, since the panel
    // button shares the "Approve" label).
    await userEvent.click(approveBtn);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Approve$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/p-draft/approve");
    });
  });

  it("shows the plan's economics to an approver and guards a below-target approval", async () => {
    h.me = makeMe({ id: "u-bul", roles: ["BUL"] });
    const d = detail({ capabilities: { canApproveDraft: true } });
    d.approvalFinancials = {
      plannedFee: 90000,
      plannedCost: 65000,
      adjustedFee: 99000,
      contingencyPct: 0.1,
      contingencyAmt: 9000,
      marginPct: 28.3,
      belowTarget: true,
    };
    mockGet(d);
    (api.post as any).mockResolvedValue({});

    renderWithProviders(<ProjectDetailPage />, {
      route: "/projects/p-draft",
      path: "/projects/:id",
    });

    // The financial summary renders for the approver, flagged below target.
    expect(await screen.findByText("28.3%")).toBeInTheDocument();
    expect(screen.getByText(/Below the 35% target margin/i)).toBeInTheDocument();

    // Approving routes through the guarded confirm ("Approve anyway").
    await userEvent.click(screen.getByRole("button", { name: /^Approve$/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/below the 35% target/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Approve anyway/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/p-draft/approve");
    });
  });

  it("the owner sees the rejection banner and can resubmit", async () => {
    h.me = makeMe({ id: "u-owner", roles: ["PM"] }); // the owner
    mockGet(
      detail({
        project: { rejectionNote: "Trim the contingency" },
        capabilities: { canManageReviewers: true },
      })
    );
    (api.post as any).mockResolvedValue({});

    renderWithProviders(<ProjectDetailPage />, {
      route: "/projects/p-draft",
      path: "/projects/:id",
    });

    expect(await screen.findByText(/Changes requested/i)).toBeInTheDocument();
    expect(screen.getByText(/Trim the contingency/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Resubmit/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/p-draft/resubmit");
    });
  });

  it("a non-owner reviewer without approval rights sees neither approve nor resubmit", async () => {
    h.me = makeMe({ id: "u-reviewer", roles: ["PM"] }); // not owner, cannot approve
    mockGet(detail({}));

    renderWithProviders(<ProjectDetailPage />, {
      route: "/projects/p-draft",
      path: "/projects/:id",
    });

    // The draft panel still renders (it's a draft) ...
    expect(await screen.findByText(/Draft project/i)).toBeInTheDocument();
    // ... but no approve/reject/resubmit affordances.
    expect(screen.queryByRole("button", { name: /^Approve$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Reject$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resubmit/i })).not.toBeInTheDocument();
  });

  it("flags a cross-BU resource on the overview resources table", async () => {
    h.me = makeMe({ id: "u-viewer", roles: ["PM"] });
    mockGet(
      detail({
        project: { status: "active" },
        capabilities: { isDraft: false },
        assignments: [
          {
            id: "a1",
            userId: "x1",
            user: { id: "x1", name: "Local Person", email: "l@e.com" },
            projectRole: "Engineer",
            businessUnit: "US-ORD-OWLS", // same as the owning BU → no badge
            plannedHours: 0,
            actualHours: 0,
          },
          {
            id: "a2",
            userId: "x2",
            user: { id: "x2", name: "Borrowed Person", email: "b@e.com" },
            projectRole: "Engineer",
            businessUnit: "EU-BER-FOXES", // a different BU → cross-BU badge
            plannedHours: 0,
            actualHours: 0,
          },
        ],
      })
    );

    renderWithProviders(<ProjectDetailPage />, {
      route: "/projects/p-draft",
      path: "/projects/:id",
    });

    await screen.findByText("Borrowed Person");
    // Exactly the borrowed resource is flagged.
    expect(screen.getByText("cross-BU")).toBeInTheDocument();
  });
});
