import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import { initialData } from "@/lib/kanban";

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends prompt, shows assistant response, and applies board updates", async () => {
    const onBoardUpdate = vi.fn();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const updatedBoard = {
      ...initialData,
      columns: [
        { ...initialData.columns[0], title: "AI Updated" },
        ...initialData.columns.slice(1),
      ],
    };

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "Done. I updated the column title.",
        boardUpdatesApplied: true,
        board: updatedBoard,
      }),
    });

    render(<ChatSidebar username="user" onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(
      screen.getByLabelText(/prompt/i),
      "Rename first column to AI Updated"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat?user=user",
      expect.objectContaining({ method: "POST" })
    );

    expect(
      await screen.findByText(/done\. i updated the column title\./i)
    ).toBeInTheDocument();
    expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard);
    expect(
      await screen.findByText(/board updated from last response/i)
    ).toBeVisible();
  });

  it("shows an error when request fails", async () => {
    const onBoardUpdate = vi.fn();
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "OpenRouter unavailable" }),
    });

    render(<ChatSidebar username="user" onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByLabelText(/prompt/i), "Try this");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/openrouter unavailable/i)).toBeVisible();
    expect(onBoardUpdate).not.toHaveBeenCalled();
  });
});
