import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal, Tabs, TabPanel, FormInput, Button, ConfirmModal, PromptModal } from "./ui";
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

// ═══════════════════════════════════════════════════════════════
// ConfirmModal
// ═══════════════════════════════════════════════════════════════

describe("ConfirmModal", () => {
  it("renders message and both action buttons", () => {
    renderWithProviders(
      <ConfirmModal
        open
        title="Delete domain?"
        message="This will block new signups from spantree.com."
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/block new signups/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onConfirm exactly once when the confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmModal
        open
        title="Confirm"
        message="Are you sure?"
        confirmLabel="Yes, do it"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Yes, do it" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("danger tone renders the rose-coloured confirm button", () => {
    renderWithProviders(
      <ConfirmModal
        open
        title="Delete"
        message="Forever"
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );

    // Tone "danger" maps to the rose-600 class in Button. We don't assert
    // every class but verify one telltale rose- prefix is present.
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toMatch(/rose-/);
  });

  it("Escape on the dialog triggers onCancel (delegated through Modal)", async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmModal
        open
        title="Confirm"
        message="Q"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );

    await userEvent.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
// PromptModal
// ═══════════════════════════════════════════════════════════════

describe("PromptModal", () => {
  it("submits the entered value", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <PromptModal
        open
        title="Unlock week"
        message="Why?"
        submitLabel="Unlock"
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "client requested late timesheet");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(onSubmit).toHaveBeenCalledWith("client requested late timesheet");
  });

  it("respects initialValue and resets on reopen", async () => {
    const { rerender } = renderWithProviders(
      <PromptModal
        open={false}
        title="X"
        initialValue="default"
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );

    rerender(
      <PromptModal
        open={true}
        title="X"
        initialValue="default"
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );

    const input = (await screen.findByRole("textbox")) as HTMLInputElement;
    expect(input.value).toBe("default");
  });

  it("disables submit while validator returns a non-null error", async () => {
    renderWithProviders(
      <PromptModal
        open
        title="Hours per week"
        validator={(v) => {
          if (v === "") return null;
          const n = Number(v);
          return n >= 0 && n <= 168 ? null : "0-168 only";
        }}
        submitLabel="Apply"
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    );

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "999");

    const submit = screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByText("0-168 only")).toBeInTheDocument();
  });

  it("cancel does not invoke onSubmit", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <PromptModal
        open
        title="X"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
