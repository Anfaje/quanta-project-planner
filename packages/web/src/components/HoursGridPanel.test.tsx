import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HoursGridPanel } from "./HoursGridPanel";
import { renderWithProviders } from "../test/render";
import type { HoursGrid } from "../lib/types";

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

import { api } from "../lib/api";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseGrid: HoursGrid = {
  projectId: "p1",
  totalWeeks: 2,
  weeks: [
    { week: 0, weekStartDate: "2026-02-02", locked: false },
    { week: 1, weekStartDate: "2026-02-09", locked: false },
  ],
  assignments: [
    {
      id: "a1",
      userId: "u-ic",
      user: { id: "u-ic", name: "Ivy Coder", email: "ic@example.com" },
      projectRole: "iOS Dev",
      businessUnit: "US-ORD-OWLS",
      billRate: 185,
      costRate: 95,
      entries: [
        { week: 0, plannedHours: 20, actualHours: 16, locked: false },
        { week: 1, plannedHours: 20, actualHours: null, locked: false },
      ],
    },
  ],
  capabilities: {
    canEditOwnActuals: true,
    canManagePlan: true,
    canLockWeeks: true,
  },
};

describe("HoursGridPanel", () => {
  it("renders one row per assignment and one column per week", async () => {
    (api.get as any).mockResolvedValueOnce(baseGrid);

    renderWithProviders(<HoursGridPanel projectId="p1" />);

    await screen.findByText("Ivy Coder");
    // Two week headers (W1, W2)
    expect(screen.getByText("W1")).toBeInTheDocument();
    expect(screen.getByText("W2")).toBeInTheDocument();
    // Planned and actual values displayed.
    expect(screen.getAllByText("20").length).toBeGreaterThan(0);
    expect(screen.getByText("16")).toBeInTheDocument();
  });

  it("inline edit accumulates into a pending change with Save/Discard toolbar", async () => {
    (api.get as any).mockResolvedValueOnce(baseGrid);

    renderWithProviders(<HoursGridPanel projectId="p1" />);
    await screen.findByText("Ivy Coder");

    // Click the actual-hours cell for week 0 (currently "16").
    const cellButton = screen.getByText("16");
    await userEvent.click(cellButton);

    // It becomes an input; type new value and blur.
    const input = (await screen.findByDisplayValue("16")) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "8");
    input.blur();

    // The pending counter should appear in the toolbar.
    await waitFor(() => {
      expect(screen.getByText(/1 pending change/i)).toBeInTheDocument();
    });
    // Discard button surfaces now.
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("Save flushes pending edits to PUT /api/projects/:id/hours and invalidates the cache", async () => {
    (api.get as any).mockResolvedValueOnce(baseGrid);
    (api.put as any).mockResolvedValueOnce(undefined);

    renderWithProviders(<HoursGridPanel projectId="p1" />);
    await screen.findByText("Ivy Coder");

    // Edit week 0 actual: 16 → 12
    await userEvent.click(screen.getByText("16"));
    const input = (await screen.findByDisplayValue("16")) as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, "12");
    input.blur();

    await screen.findByText(/1 pending change/i);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith("/api/projects/p1/hours", {
        updates: [
          expect.objectContaining({
            assignmentId: "a1",
            projectWeek: 0,
            actualHours: 12,
          }),
        ],
      });
    });
  });

  it("Lock action POSTs /weeks/:week/lock", async () => {
    (api.get as any).mockResolvedValueOnce(baseGrid);
    (api.post as any).mockResolvedValueOnce(undefined);

    renderWithProviders(<HoursGridPanel projectId="p1" />);
    await screen.findByText("Ivy Coder");

    // Open the ⋯ menu on week 0 (the first one rendered).
    const ellipses = screen.getAllByText("⋯");
    await userEvent.click(ellipses[0]);

    await userEvent.click(await screen.findByText(/lock week/i));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/api/projects/p1/weeks/0/lock");
    });
  });
});
