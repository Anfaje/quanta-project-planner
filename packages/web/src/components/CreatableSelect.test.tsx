import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreatableSelect, CREATE_SENTINEL } from "./CreatableSelect";

const options = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

describe("CreatableSelect", () => {
  it("renders '+ Add new …' as the final option only when canCreate is true", () => {
    const { rerender } = render(
      <CreatableSelect
        value="a"
        onChange={() => {}}
        options={options}
        canCreate
        createLabel="New account…"
        renderCreateModal={() => null}
        ariaLabel="Account"
      />
    );
    const select = screen.getByLabelText("Account") as HTMLSelectElement;
    const labels = [...select.options].map((o) => o.text);
    expect(labels[labels.length - 1]).toBe("+ New account…");

    rerender(
      <CreatableSelect
        value="a"
        onChange={() => {}}
        options={options}
        canCreate={false}
        createLabel="New account…"
        renderCreateModal={() => null}
        ariaLabel="Account"
      />
    );
    expect([...select.options].map((o) => o.text)).not.toContain("+ New account…");
  });

  it("choosing the affordance opens the create modal without committing a selection", () => {
    const onChange = vi.fn();
    render(
      <CreatableSelect
        value="a"
        onChange={onChange}
        options={options}
        canCreate
        createLabel="New account…"
        renderCreateModal={() => <div data-testid="create-modal" />}
        ariaLabel="Account"
      />
    );
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: CREATE_SENTINEL } });
    expect(screen.getByTestId("create-modal")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    // The controlled value was never changed — the previous selection stands.
    expect((screen.getByLabelText("Account") as HTMLSelectElement).value).toBe("a");
  });

  it("closing the modal restores a usable select with the previous value", () => {
    render(
      <CreatableSelect
        value="b"
        onChange={() => {}}
        options={options}
        canCreate
        createLabel="New account…"
        renderCreateModal={(close) => (
          <button data-testid="cancel" onClick={close}>
            cancel
          </button>
        )}
        ariaLabel="Account"
      />
    );
    const select = screen.getByLabelText("Account") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: CREATE_SENTINEL } });
    fireEvent.click(screen.getByTestId("cancel"));
    expect(screen.queryByTestId("cancel")).toBeNull();
    expect(select.value).toBe("b");
  });

  it("selecting a normal option calls onChange with its value", () => {
    const onChange = vi.fn();
    render(
      <CreatableSelect
        value="a"
        onChange={onChange}
        options={options}
        canCreate
        createLabel="New account…"
        renderCreateModal={() => null}
        ariaLabel="Account"
      />
    );
    fireEvent.change(screen.getByLabelText("Account"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
