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
  {
    id: "bu-2",
    code: "EU-BER-FOXES",
    name: "Berlin Foxes",
    isActive: true,
    userCount: 3,
    projectCount: 1,
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
    status: "active",
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
    status: "active",
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 1,
  },
  {
    id: "u3",
    email: "jordan@example.com",
    name: "Jordan Cross",
    costRate: 100,
    primaryBu: { code: "EU-BER-FOXES", name: "Berlin Foxes" },
    roles: ["IC"],
    projectRoles: ["Backend"],
    financialAccess: false,
    isActive: true,
    status: "active",
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 0,
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

  it("applies an 18% markup and labels it for a cross-BU resource", async () => {
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);

    // Step 1: project is owned by US-ORD-OWLS (bu-1).
    await userEvent.type(screen.getByLabelText(/project name/i), "Cross BU Test");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-15");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 2: Jordan is in EU-BER-FOXES — a different BU than the owner.
    await screen.findByText(/Team directory/i);
    await userEvent.click(screen.getByText("Jordan Cross"));

    // Cost pre-fills to baseline + 18% (100 × 1.18 = 118) and is labelled.
    expect(await screen.findByText(/incl\. 18% cross-BU markup/i)).toBeInTheDocument();
    const spinbuttons = screen.getAllByRole("spinbutton"); // [bill, cost]
    expect(spinbuttons[1]).toHaveValue(118);
  });

  it("uses the baseline (no markup) for a same-BU resource", async () => {
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);

    await userEvent.type(screen.getByLabelText(/project name/i), "Same BU Test");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-15");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Maya is in US-ORD-OWLS — the same BU as the owner.
    await screen.findByText(/Team directory/i);
    await userEvent.click(screen.getByText("Maya Chen"));

    expect(screen.queryByText(/cross-BU markup/i)).not.toBeInTheDocument();
    const spinbuttons = screen.getAllByRole("spinbutton");
    expect(spinbuttons[1]).toHaveValue(120); // Maya's baseline, unchanged
  });

  it("fixed-price: hides bill rate, requires a contract value, and sends pricingModel", async () => {
    (api.post as any).mockResolvedValueOnce({
      projectId: "p-fp",
      projectCode: "FP-1",
      status: "draft",
    });
    renderWithProviders(<ProjectWizardPage />);
    await screen.findByText(/Project name/i);

    // Step 1 — basics, then switch to Fixed price.
    await userEvent.type(screen.getByLabelText(/project name/i), "Fixed Bid");
    await userEvent.selectOptions(screen.getByLabelText(/account/i), "acc-1");
    await userEvent.selectOptions(screen.getByLabelText(/owning business unit/i), "bu-1");
    await userEvent.type(screen.getByLabelText(/start date/i), "2026-03-01");
    await userEvent.type(screen.getByLabelText(/end date/i), "2026-03-08");
    await userEvent.click(screen.getByRole("button", { name: /fixed price/i }));

    // Continue is blocked until a contract value is entered.
    const continueBtn = screen.getByRole("button", { name: /continue/i }) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText(/contract value/i), "250000");
    expect(continueBtn.disabled).toBe(false);
    await userEvent.click(continueBtn);

    // Step 2 — pick Maya. The bill-rate input is hidden, so only the cost
    // spinbutton is present in her row.
    await screen.findByText(/Team directory/i);
    await userEvent.click(screen.getByText("Maya Chen"));
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1); // cost only, no bill
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Step 3 — hours
    await screen.findByRole("heading", { name: /^Planned hours$/i });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    // Step 4 — preview shows the contract value rather than a quoted fee.
    await screen.findByText(/Financial preview/i);
    expect(screen.getByText(/Contract value/i)).toBeInTheDocument();
    expect(screen.queryByText(/Quoted fee/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Step 5 — review + save as draft.
    await screen.findByRole("heading", { name: /^Review$/i });
    await userEvent.click(screen.getByRole("button", { name: /save as draft/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({
          name: "Fixed Bid",
          pricingModel: "fixed_price",
          fixedPrice: 250000,
          assignments: [expect.objectContaining({ userId: "u1", costRate: 120 })],
          saveAsDraft: true,
        })
      );
    });
    // The assignment carries no bill rate on a fixed-price project.
    const sent = (api.post as any).mock.calls[0][1];
    expect(sent.assignments[0].billRate).toBeUndefined();
  });
});
