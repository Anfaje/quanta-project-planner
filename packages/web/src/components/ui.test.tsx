import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, Tabs, TabPanel, FormInput, Button } from "./ui";
import { renderWithProviders } from "../test/render";

/**
 * Tests for the shared UI primitives' a11y guarantees.
 *
 * - Modal: focus trap (Tab cycles within), focus restoration on close,
 *   Escape closes, role + labelling correctness.
 * - Tabs: role="tablist" / role="tab" with proper aria-selected,
 *   arrow-key keyboard navigation, Home/End jumps.
 * - FormInput: aria-invalid + aria-describedby wiring.
 */

// ═══════════════════════════════════════════════════════════════
// Modal
// ═══════════════════════════════════════════════════════════════

function ModalHarness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dialog title">
        <FormInput label="First field" value="" onChange={() => {}} />
        <FormInput label="Second field" value="" onChange={() => {}} />
        <Button onClick={() => setOpen(false)}>Submit</Button>
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders with role='dialog' + aria-modal + aria-labelledby pointing at the title", async () => {
    renderWithProviders(<ModalHarness initialOpen />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toBe("Dialog title");
  });

  it("Escape closes the dialog", async () => {
    renderWithProviders(<ModalHarness initialOpen />);
    expect(screen.queryByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("restores focus to the opener after close", async () => {
    renderWithProviders(<ModalHarness />);

    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    await userEvent.click(opener);
    await screen.findByRole("dialog");

    // Close via the title's Close button.
    await userEvent.click(screen.getByRole("button", { name: /close dialog/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Focus is back on the opener button.
    expect(document.activeElement).toBe(opener);
  });

  it("Tab from the last focusable element cycles to the first", async () => {
    renderWithProviders(<ModalHarness initialOpen />);

    // Force focus to the Submit button (last focusable).
    const submit = screen.getByRole("button", { name: "Submit" });
    submit.focus();
    expect(document.activeElement).toBe(submit);

    // Tab should wrap to the first focusable, which is the Close button in
    // the dialog header (renders before the inputs).
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close dialog/i }));
  });

  it("Shift+Tab from the first focusable cycles to the last", async () => {
    renderWithProviders(<ModalHarness initialOpen />);

    const closeBtn = screen.getByRole("button", { name: /close dialog/i });
    closeBtn.focus();

    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Submit" }));
  });
});

// ═══════════════════════════════════════════════════════════════
// Tabs
// ═══════════════════════════════════════════════════════════════

function TabsHarness({ initial = "a" }: { initial?: "a" | "b" | "c" }) {
  const [active, setActive] = useState<"a" | "b" | "c">(initial);
  return (
    <>
      <Tabs
        tabs={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
          { id: "c", label: "Gamma" },
        ]}
        active={active}
        onChange={setActive}
      />
      <TabPanel id="a" active={active === "a"}>
        Alpha content
      </TabPanel>
      <TabPanel id="b" active={active === "b"}>
        Beta content
      </TabPanel>
      <TabPanel id="c" active={active === "c"}>
        Gamma content
      </TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("renders role='tablist' with tabs + correct aria-selected", () => {
    renderWithProviders(<TabsHarness />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("only the active tab is in the natural tab order (others have tabIndex=-1)", () => {
    renderWithProviders(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight on the active tab activates and focuses the next tab", async () => {
    renderWithProviders(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Beta content")).toBeInTheDocument();
  });

  it("ArrowLeft from first tab wraps to last", async () => {
    renderWithProviders(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    await userEvent.keyboard("{ArrowLeft}");

    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("End jumps to the last tab; Home returns to the first", async () => {
    renderWithProviders(<TabsHarness />);
    const tabs = screen.getAllByRole("tab");

    tabs[0].focus();
    await userEvent.keyboard("{End}");
    expect(document.activeElement).toBe(tabs[2]);

    await userEvent.keyboard("{Home}");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("each TabPanel is role='tabpanel' with aria-labelledby pointing at its tab", () => {
    renderWithProviders(<TabsHarness initial="b" />);

    const tabs = screen.getAllByRole("tab");
    const activeTab = tabs.find((t) => t.getAttribute("aria-selected") === "true")!;
    const tabId = activeTab.id;

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabId);
  });
});

// ═══════════════════════════════════════════════════════════════
// FormInput
// ═══════════════════════════════════════════════════════════════

describe("FormInput a11y wiring", () => {
  it("error state sets aria-invalid and aria-describedby to the message id", () => {
    renderWithProviders(
      <FormInput label="Email" value="bad@" onChange={() => {}} error="Invalid address" />
    );

    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toContain("Invalid address");
  });

  it("hint without error: aria-describedby points at the hint, no aria-invalid", () => {
    renderWithProviders(
      <FormInput label="Password" value="abc" onChange={() => {}} hint="At least 12 chars" />
    );

    const input = screen.getByLabelText("Password");
    expect(input).not.toHaveAttribute("aria-invalid");

    const describedBy = input.getAttribute("aria-describedby");
    expect(document.getElementById(describedBy!)?.textContent).toContain("At least 12 chars");
  });
});
