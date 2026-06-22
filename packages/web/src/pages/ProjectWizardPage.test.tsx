import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectWizardPage } from "./ProjectWizardPage";
import { renderWithProviders, TEST_USER_PM } from "../test/render";
import type { AdminAccount, AdminBusinessUnit, AdminUser } from "../lib/types";

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

const navigateMock = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ me: TEST_USER_PM, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useMe: () => TEST_USER_PM,
}));

import { api } from "../lib/api";

const ACCOUNTS: AdminAccount[] = [
  { id: "acc-1", name: "Meridian Corp", code: "MER", isActive: true, projectCount: 2, managers: [] },
];
const BUS: AdminBusinessUnit[] = [
  {
    id: "bu-1",
    code: "US-ORD-OWLS",
    name: "Chicago Owls",
    isActive: true,
    userCount: 5,
    projectCount: 2,
    bul: null,
  },
];
const USERS: AdminUser[] = [
  {
    id: "u1",
    email: "maya@example.com",
    name: "Maya Chen",
    costRate: 120,
    roles: ["IC"],
    projectRoles: ["iOS Dev"],
    primaryBu: { code: "US-ORD-OWLS", name: "Chicago Owls" },
    financialAccess: false,
    isActive: true,
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 1,
  },
  {
    id: "u2",
    email: "alex@example.com",
    name: "Alex Rivera",
    costRate: 110,
    roles: ["IC"],
    projectRoles: ["Backend"],
    primaryBu: { code: "US-ORD-OWLS", name: "Chicago Owls" },
    financialAccess: false,
    isActive: true,
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 1,
  },
];

function mockReferenceFetches() {
  // Each fetch call lookup happens in the order the page issues them.
  // The queries run in parallel but TanStack resolves them all before render
  // proceeds; with retry: false they hit the mocks in any order.
  (api.get as any).mockImplementation((url: string) => {
    if (url === "/api/admin/accounts") return Promise.resolve({ accounts: ACCOUNTS });
    if (url === "/api/admin/bus") return Promise.resolve({ businessUnits: BUS });
    if (url === "/api/admin/users") return Promise.resolve({ users: USERS });
    throw new Error(`Unexpected URL ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReferenceFetches();
});

describe("ProjectWizardPage", () => {
  it("disables Continue on step 1 until basics fields validate", async () => {
    renderWithProviders(<ProjectWizardPage />);

    // Reference data loads before fields appear.
    await screen.findByText(/Project name/i);

    const continueBtn = screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement;
    expect(continueBtn).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/project name/i), "Brand Refresh");
    // Project code is auto-generated; just confirm it's populated and matches the pattern.
    const codeField = (await screen.findByLabelText(/project code/i)) as HTMLInputElement;
    await waitFor(() => expect(codeField.value).toMatch(/^[A-Z0-9-]+$/));

    // Account + BU
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");

    // Dates
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-29");

    await waitFor(() => expect(continueBtn).not.toBeDisabled());
  });

  it("can navigate Continue → Back across step 1 → step 2 once basics is valid", async () => {
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);

    // Fill step 1 quickly.
    await userEvent.type(screen.getByLabelText(/project name/i), "Brand Refresh");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-29");

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2 directory header appears
    expect(await screen.findByText(/Team directory/i)).toBeInTheDocument();

    // Back button returns us to step 1. The "Back" button we want is the
    // nav-footer one with an exact case match — "Backend" (Alex's role) also
    // matches /back/i otherwise.
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByLabelText(/project name/i)).toBeInTheDocument();
  });

  it("step 2 directory click adds a resource and reflects them in the team pane", async () => {
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);
    // Fill step 1 in one go.
    await userEvent.type(screen.getByLabelText(/project name/i), "Brand Refresh");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-15");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await screen.findByText(/Team directory/i);

    // Maya appears in the directory. Adding her transfers her into the
    // selected pane and the count next to 'Project team' goes from 0 to 1.
    await userEvent.click(screen.getByText("Maya Chen"));

    // Project team count badge updates
    await waitFor(() => {
      expect(screen.getByText(/Project team/i).textContent).toMatch(/1/);
    });
  });

  it("end-to-end: completes all steps, saves a draft, then opens the share dialog", async () => {
    (api.post as any).mockResolvedValueOnce({
      projectId: "p-new",
      projectCode: "BRA-1234",
      status: "draft",
    });
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);

    // Step 1
    await userEvent.type(screen.getByLabelText(/project name/i), "Brand Refresh");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-08"); // 2 weeks
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2 — pick Maya, skip rate editing (defaults are fine)
    await screen.findByText(/Team directory/i);
    await userEvent.click(screen.getByText("Maya Chen"));
    // The Continue button is at the bottom; jump to step 3.
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 3 — hours (preview-only so it always validates), skip.
    // Multiple elements contain "Planned hours" (heading + subtitle), so
    // scope to the h2 specifically.
    await screen.findByRole("heading", { name: /^Planned hours$/i });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Step 4 — financial preview
    await screen.findByText(/Financial preview/i);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 5 — Review + Save as draft (a PM can't launch directly)
    await screen.findByRole("heading", { name: /^Review$/i });
    await userEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({
          name: "Brand Refresh",
          accountId: "acc-1",
          owningBuId: "bu-1",
          startDate: "2026-03-01",
          endDate: "2026-03-08",
          assignments: [
            expect.objectContaining({
              userId: "u1",
              projectRole: "iOS Dev",
              billRate: expect.any(Number),
              costRate: 120, // defaulted from Maya's standing cost rate
            }),
          ],
          // No hours entered → plannedHours filtered to empty.
          plannedHours: [],
          // PM path always saves a draft.
          saveAsDraft: true,
        })
      );
    });

    // The share dialog opens; closing it navigates to the new draft.
    const doneBtn = await screen.findByRole("button", { name: /done/i });
    await userEvent.click(doneBtn);
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/projects/p-new");
    });
  });
});
