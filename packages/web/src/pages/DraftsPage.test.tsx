import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DraftsPage } from "./DraftsPage";
import { renderWithProviders, TEST_USER_PM } from "../test/render";
import type { DraftListItem } from "../lib/types";

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
  useAuth: () => ({ me: TEST_USER_PM, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useMe: () => TEST_USER_PM,
}));

import { api } from "../lib/api";

function draft(over: Partial<DraftListItem>): DraftListItem {
  return {
    id: "d1",
    name: "Brand Refresh",
    projectCode: "BRF-1",
    status: "draft",
    startDate: "2026-03-01",
    endDate: "2026-03-29",
    account: { id: "a1", code: "MER", name: "Meridian" },
    owningBu: { id: "bu-1", code: "US-ORD-OWLS", name: "Chicago Owls" },
    createdBy: { id: "u-pm", name: "Penelope Manager", email: "pm@example.com" },
    reviewers: [],
    resourceCount: 2,
    updatedAt: "2026-03-02",
    rejectionNote: null,
    rejectionAt: null,
    changesRequested: false,
    isOwner: true,
    canApprove: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DraftsPage", () => {
  it("splits drafts into My / Pending / Shared tabs with counts", async () => {
    (api.get as any).mockResolvedValue({
      drafts: [
        draft({ id: "mine", name: "My Draft", isOwner: true }),
        draft({
          id: "shared",
          name: "Shared Draft",
          isOwner: false,
          canApprove: false,
          createdBy: { id: "other", name: "Olivia Other", email: "o@e.com" },
        }),
      ],
    });

    renderWithProviders(<DraftsPage />);

    // Tabs render with the right counts.
    expect(await screen.findByRole("tab", { name: /My drafts \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pending my approval \(0\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Shared with me \(1\)/i })).toBeInTheDocument();

    // My drafts is the default tab: shows my draft, not the shared one.
    expect(screen.getByText("My Draft")).toBeInTheDocument();
    expect(screen.queryByText("Shared Draft")).not.toBeInTheDocument();

    // Switch to "Shared with me": the shared draft appears.
    await userEvent.click(screen.getByRole("tab", { name: /Shared with me/i }));
    expect(await screen.findByText("Shared Draft")).toBeInTheDocument();
  });

  it("flags a rejected draft as Changes requested and links to its detail page", async () => {
    (api.get as any).mockResolvedValue({
      drafts: [
        draft({
          id: "needs-work",
          name: "Needs Work",
          isOwner: true,
          changesRequested: true,
          rejectionNote: "Trim the contingency",
          rejectionAt: "2026-03-03",
        }),
      ],
    });

    renderWithProviders(<DraftsPage />);

    expect(await screen.findByText("Needs Work")).toBeInTheDocument();
    expect(screen.getByText(/Changes requested/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Needs Work" })).toHaveAttribute(
      "href",
      "/projects/needs-work"
    );
  });
});
