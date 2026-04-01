import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("filters cards by search query", async () => {
    render(<KanbanBoard />);
    // All 8 initial cards visible
    const initialCards = screen.getAllByTestId(/^card-/);
    expect(initialCards.length).toBeGreaterThan(0);

    const searchInput = screen.getByLabelText(/search cards/i);
    await userEvent.type(searchInput, "Align roadmap");

    // Only the matching card should be visible
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(screen.queryByText("Gather customer signals")).not.toBeInTheDocument();
  });

  it("clears filter with Clear button", async () => {
    render(<KanbanBoard />);
    const searchInput = screen.getByLabelText(/search cards/i);
    await userEvent.type(searchInput, "Align");

    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(searchInput).toHaveValue("");
    // All cards back
    expect(screen.getByText("Gather customer signals")).toBeInTheDocument();
  });
});
