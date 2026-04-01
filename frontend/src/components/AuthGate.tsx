"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { type BoardData } from "@/lib/kanban";

const AUTH_USER_KEY = "pm-user";
const VALID_USERNAME = "user";
const VALID_PASSWORD = "password";
const LOAD_TIMEOUT_MS = 10_000;

type AuthStatus = "unknown" | "signed-out" | "signed-in";

export const AuthGate = () => {
  const [status, setStatus] = useState<AuthStatus>("unknown");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [initialBoard, setInitialBoard] = useState<BoardData | null>(null);
  const [apiError, setApiError] = useState("");
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const saveCounterRef = useRef(0);

  useEffect(() => {
    const storedUser = window.localStorage.getItem(AUTH_USER_KEY);
    if (storedUser) {
      setUsername(storedUser);
      setStatus("signed-in");
    } else {
      setStatus("signed-out");
    }
  }, []);

  const loadBoard = useCallback(async (user: string) => {
    setIsBoardLoading(true);
    setApiError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
      const response = await fetch(`/api/board?user=${encodeURIComponent(user)}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Board request failed");
      }
      const data = (await response.json()) as BoardData;
      setInitialBoard(data);
    } catch {
      setApiError("Unable to load your board. Please try again.");
    } finally {
      clearTimeout(timeoutId);
      setIsBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "signed-in" && username) {
      void loadBoard(username);
    }
  }, [loadBoard, status, username]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isValid =
      username.trim() === VALID_USERNAME && password === VALID_PASSWORD;

    if (!isValid) {
      setError("Invalid credentials. Try user / password.");
      return;
    }

    const nextUser = username.trim();
    window.localStorage.setItem(AUTH_USER_KEY, nextUser);
    setError("");
    setStatus("signed-in");
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_USER_KEY);
    setUsername("");
    setPassword("");
    setError("");
    setApiError("");
    setInitialBoard(null);
    setStatus("signed-out");
  };

  const handleBoardChange = useCallback(
    async (nextBoard: BoardData) => {
      if (!username) {
        return;
      }
      saveCounterRef.current += 1;
      const myCount = saveCounterRef.current;
      try {
        const response = await fetch(
          `/api/board?user=${encodeURIComponent(username)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(nextBoard),
          }
        );
        if (myCount !== saveCounterRef.current) return;
        if (!response.ok) {
          throw new Error("Save failed");
        }
        setApiError("");
      } catch {
        if (myCount !== saveCounterRef.current) return;
        setApiError("Unable to save changes. Please retry.");
      }
    },
    [username]
  );

  const handleAiBoardUpdate = useCallback((nextBoard: BoardData) => {
    setInitialBoard(nextBoard);
    setApiError("");
  }, []);

  if (status === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--gray-text)]">Loading...</p>
      </div>
    );
  }

  if (status === "signed-in") {
    const showBoard = !isBoardLoading && initialBoard !== null;
    const showLoadError = !isBoardLoading && initialBoard === null && apiError;

    return (
      <div className="relative">
        <div className="absolute left-6 top-6 z-30">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-[var(--stroke)] bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] shadow-sm transition hover:text-[var(--navy-dark)]"
          >
            Log out
          </button>
        </div>
        {isBoardLoading ? (
          <div className="flex min-h-screen items-center justify-center">
            <div className="rounded-2xl border border-[var(--stroke)] bg-white/90 px-6 py-4 text-sm text-[var(--gray-text)] shadow-sm">
              Loading your board...
            </div>
          </div>
        ) : showLoadError ? (
          <div className="flex min-h-screen items-center justify-center">
            <div className="rounded-2xl border border-[var(--stroke)] bg-white/90 px-6 py-4 text-sm text-[var(--secondary-purple)] shadow-sm">
              {apiError}
              <button
                type="button"
                onClick={() => void loadBoard(username)}
                className="ml-3 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)]"
              >
                Retry
              </button>
            </div>
          </div>
        ) : showBoard ? (
          <div className="xl:pr-[360px]">
            {apiError ? (
              <div className="mx-auto mt-6 w-full max-w-[1200px] rounded-2xl border border-[var(--stroke)] bg-white/90 px-5 py-3 text-sm text-[var(--secondary-purple)] shadow-sm">
                {apiError}
                <button
                  type="button"
                  onClick={() => void loadBoard(username)}
                  className="ml-3 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)]"
                >
                  Retry
                </button>
              </div>
            ) : null}
            <KanbanBoard
              initialBoard={initialBoard}
              onBoardChange={handleBoardChange}
            />
          </div>
        ) : null}
        {showBoard ? (
          <ChatSidebar
            username={username}
            onBoardUpdate={handleAiBoardUpdate}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[360px] w-[360px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.2)_0%,_rgba(32,157,215,0.05)_60%,_transparent_75%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[420px] w-[420px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.16)_0%,_rgba(117,57,145,0.05)_60%,_transparent_80%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-6">
        <div className="rounded-[28px] border border-[var(--stroke)] bg-white/85 p-8 shadow-[var(--shadow)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Kanban Studio
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
            Use the demo credentials to access your board.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                autoComplete="current-password"
                required
              />
            </label>
            {error ? (
              <p className="text-sm text-[var(--secondary-purple)]">{error}</p>
            ) : null}
            <button
              type="submit"
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
            >
              Sign in
            </button>
          </form>
          <p className="mt-4 text-xs text-[var(--gray-text)]">
            Demo credentials: user / password
          </p>
        </div>
      </main>
    </div>
  );
};
