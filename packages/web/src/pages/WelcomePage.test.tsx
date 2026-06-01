import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { WelcomePage } from "./WelcomePage";

/**
 * WelcomePage renders one of two greeting variants from navigation state,
 * and redirects to the dashboard if reached without state. We drive it
 * through a MemoryRouter whose initial entry carries the location state,
 * mirroring how MfaSetupPage navigates here.
 */

function renderAt(state: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/welcome", state }]}>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/dashboard" element={<div>Dashboard landing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("WelcomePage", () => {
  it("direct variant shows the generic welcome + IC badge + dashboard CTA", () => {
    renderAt({ welcome: { kind: "direct" }, dest: "/dashboard" });
    expect(screen.getByText("Welcome to Quanta")).toBeInTheDocument();
    expect(screen.getByText(/admin can grant additional roles/i)).toBeInTheDocument();
    expect(screen.getByText("Individual Contributor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go to dashboard/i })).toBeInTheDocument();
  });

  it("invite variant names the inviter, BU, and role", () => {
    renderAt({
      welcome: { kind: "invite", buName: "Chicago Owls", role: "iOS Dev", inviter: "Sarah Lee" },
      dest: "/dashboard",
    });
    expect(screen.getByText("You're all set")).toBeInTheDocument();
    // The sentence is composed of several spans; assert on the pieces.
    expect(screen.getByText(/Sarah Lee added you/i)).toBeInTheDocument();
    expect(screen.getByText("Chicago Owls")).toBeInTheDocument();
    expect(screen.getByText("iOS Dev")).toBeInTheDocument();
    expect(screen.getByText("Individual Contributor")).toBeInTheDocument();
  });

  it("redirects to the dashboard when reached with no welcome state", () => {
    renderAt(null);
    expect(screen.getByText("Dashboard landing")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Quanta")).not.toBeInTheDocument();
  });
});
