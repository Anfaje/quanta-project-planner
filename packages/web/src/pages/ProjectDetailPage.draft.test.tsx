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
} = {}): ProjectDetail {
  return {
    project: {
      id: "p-draft",
      name: "Spring Campaign",
      projectCode: "DRF-1",
      status: "draft",
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
      ...(opts.project ?? {}),
    },
    assignments: [],
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
});
