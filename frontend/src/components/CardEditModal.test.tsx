import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CardEditModal } from "@/components/CardEditModal";
import type { Card } from "@/lib/kanban";

const BASE_CARD: Card = {
  id: "card-1",
  title: "Test Task",
  details: "Some details",
  priority: "low",
  dueDate: "2026-06-01",
  labels: "bug,urgent",
};

describe("CardEditModal", () => {
  it("renders with existing card values", () => {
    render(<CardEditModal card={BASE_CARD} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByDisplayValue("Test Task")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Some details")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("low");
    expect(screen.getByDisplayValue("2026-06-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("bug,urgent")).toBeInTheDocument();
  });

  it("calls onSave with updated values", async () => {
    const onSave = vi.fn();
    render(<CardEditModal card={BASE_CARD} onSave={onSave} onClose={vi.fn()} />);

    const titleInput = screen.getByDisplayValue("Test Task");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated Task");

    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated Task" })
    );
  });

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<CardEditModal card={BASE_CARD} onSave={vi.fn()} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves priority selection", async () => {
    const onSave = vi.fn();
    render(<CardEditModal card={{ ...BASE_CARD, priority: "none" }} onSave={onSave} onClose={vi.fn()} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "high");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ priority: "high" }));
  });

  it("clears due date when empty", async () => {
    const onSave = vi.fn();
    render(<CardEditModal card={BASE_CARD} onSave={onSave} onClose={vi.fn()} />);

    const dueDateInput = screen.getByDisplayValue("2026-06-01");
    await userEvent.clear(dueDateInput);
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dueDate: null }));
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <CardEditModal card={BASE_CARD} onSave={vi.fn()} onClose={onClose} />
    );
    const backdrop = container.firstChild as HTMLElement;
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
