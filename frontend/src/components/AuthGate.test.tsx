import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";
import { initialData } from "@/lib/kanban";

describe("AuthGate", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };

    Object.defineProperty(window, "localStorage", {
      value: mockStorage,
      writable: true,
    });

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mockApi = () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/api/board")) {
        const method = init?.method ?? "GET";
        if (method === "PUT") {
          return Promise.resolve({ ok: true, json: async () => initialData });
        }
        return Promise.resolve({ ok: true, json: async () => initialData });
      }
      if (typeof input === "string" && input.startsWith("/api/chat")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: "Done",
            boardUpdatesApplied: false,
            board: initialData,
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  };

  it("renders the sign-in screen by default", async () => {
    mockApi();
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  it("rejects invalid credentials", async () => {
    mockApi();
    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/username/i), "bad");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText(/invalid credentials/i)
    ).toBeInTheDocument();
  });

  it("signs in and logs out", async () => {
    mockApi();
    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  it("respects saved auth state", async () => {
    mockApi();
    window.localStorage.setItem("pm-user", "user");
    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: /kanban studio/i })
    ).toBeVisible();
  });

  it("shows an error when the board fails to load", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/unable to load your board/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows an error when the board fails to save", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => {
      if (typeof input === "string" && input.startsWith("/api/board")) {
        if ((init?.method ?? "GET") === "PUT") {
          return Promise.resolve({ ok: false, json: async () => ({ error: "Server error" }) });
        }
        return Promise.resolve({ ok: true, json: async () => initialData });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });

    await userEvent.type(screen.getByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    // Board loads; KanbanBoard mounts and fires onBoardChange → PUT → fails
    expect(await screen.findByText(/unable to save/i)).toBeInTheDocument();
  });
});
