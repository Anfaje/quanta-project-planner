import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminConsolePage } from "./AdminConsolePage";
import { renderWithProviders, TEST_USER_AA } from "../test/render";
import type { AdminUser } from "../lib/types";

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

vi.mock("../context/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ me: TEST_USER_AA, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useMe: () => TEST_USER_AA,
}));

import { api } from "../lib/api";

const USERS: AdminUser[] = [
  {
    id: "u1",
    email: "maya@example.com",
    name: "Maya Chen",
    roles: ["IC"],
    projectRoles: ["iOS Dev"],
    primaryBu: { code: "BU-A", name: "BU A" },
    financialAccess: false,
    costRate: 120,
    isActive: true,
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 1,
  },
  {
    id: "u2",
    email: "sam@example.com",
    name: "Sam Unset",
    roles: ["IC"],
    projectRoles: [],
    primaryBu: { code: "BU-A", name: "BU A" },
    financialAccess: false,
    costRate: null,
    isActive: true,
    createdAt: "2025-01-01",
    managedAccounts: [],
    projectCount: 0,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  (api.get as any).mockImplementation((url: string) => {
    if (url === "/api/admin/users") return Promise.resolve({ users: USERS });
    if (url === "/api/admin/bus") return Promise.resolve({ businessUnits: [] });
    if (url === "/api/admin/accounts") return Promise.resolve({ accounts: [] });
    return Promise.resolve({});
  });
});

describe("AdminConsolePage — cost rate", () => {
  it("shows a user's cost rate", async () => {
    renderWithProviders(<AdminConsolePage />);
    expect(await screen.findByText("Maya Chen")).toBeInTheDocument();
    expect(screen.getByText("$120")).toBeInTheDocument();
  });

  it("edits a cost rate via the prompt and PUTs the new value", async () => {
    (api.put as any).mockResolvedValue({ id: "u1", costRate: 150 });
    renderWithProviders(<AdminConsolePage />);
    await screen.findByText("Maya Chen");

    // Click the current rate to open the editor.
    await userEvent.click(screen.getByText("$120"));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "150");
    await userEvent.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/api/admin/users/u1/cost-rate", { costRate: 150 });
    });
  });
});
