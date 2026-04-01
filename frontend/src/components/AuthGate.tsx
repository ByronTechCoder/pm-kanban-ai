"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { type BoardData } from "@/lib/kanban";

const AUTH_USER_KEY = "pm-user";
const LOAD_TIMEOUT_MS = 10_000;

type AuthStatus = "unknown" | "signed-out" | "signed-in";
type AuthMode = "login" | "register";

export const AuthGate = () => {
  const [status, setStatus] = useState<AuthStatus>("unknown");
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [initialBoard, setInitialBoard] = useState<BoardData | null>(null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [apiError, setApiError] = useState("");
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const loadBoard = useCallback(async (user: string, boardId?: string | null) => {
    setIsBoardLoading(true);
    setApiError("");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
    try {
      const params = new URLSearchParams({ user });
      if (boardId) params.set("board_id", boardId);
      const response = await fetch(`/api/board?${params.toString()}`, {
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
      void loadBoard(username, activeBoardId);
    }
  }, [loadBoard, status, username, activeBoardId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setError("Username is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }

    if (mode === "register") {
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    setError("");

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? (mode === "register" ? "Registration failed." : "Invalid credentials."));
        return;
      }

      window.localStorage.setItem(AUTH_USER_KEY, trimmedUser);
      setError("");
      setStatus("signed-in");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_USER_KEY);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setApiError("");
    setInitialBoard(null);
    setActiveBoardId(null);
    setStatus("signed-out");
  };

  const handleBoardChange = useCallback(
    async (nextBoard: BoardData) => {
      if (!username) return;
      saveCounterRef.current += 1;
      const myCount = saveCounterRef.current;
      try {
        const params = new URLSearchParams({ user: username });
        if (activeBoardId) params.set("board_id", activeBoardId);
        const response = await fetch(`/api/board?${params.toString()}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextBoard),
        });
        if (myCount !== saveCounterRef.current) return;
        if (!response.ok) throw new Error("Save failed");
        setApiError("");
      } catch {
        if (myCount !== saveCounterRef.current) return;
        setApiError("Unable to save changes. Please retry.");
      }
    },
    [username, activeBoardId]
  );

  const handleAiBoardUpdate = useCallback((nextBoard: BoardData) => {
    setInitialBoard(nextBoard);
    setApiError("");
  }, []);

  const handleBoardSwitch = useCallback((boardId: string) => {
    setActiveBoardId(boardId);
    setInitialBoard(null);
  }, []);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [cpOldPassword, setCpOldPassword] = useState("");
  const [cpNewPassword, setCpNewPassword] = useState("");
  const [cpConfirm, setCpConfirm] = useState("");
  const [cpError, setCpError] = useState("");
  const [cpSuccess, setCpSuccess] = useState(false);
  const [cpSubmitting, setCpSubmitting] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError("");
    if (cpNewPassword.length < 6) { setCpError("New password must be at least 6 characters."); return; }
    if (cpNewPassword !== cpConfirm) { setCpError("Passwords do not match."); return; }
    setCpSubmitting(true);
    try {
      const resp = await fetch(`/api/auth/change-password?user=${encodeURIComponent(username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: cpOldPassword, new_password: cpNewPassword }),
      });
      if (resp.ok) {
        setCpSuccess(true);
        setCpOldPassword(""); setCpNewPassword(""); setCpConfirm("");
      } else {
        const d = (await resp.json()) as { error?: string };
        setCpError(d.error ?? "Failed to change password.");
      }
    } catch {
      setCpError("Network error.");
    } finally {
      setCpSubmitting(false);
    }
  };

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
        <div className="absolute left-6 top-6 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-[var(--stroke)] bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] shadow-sm transition hover:text-[var(--navy-dark)]"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={() => { setShowChangePassword(true); setCpSuccess(false); setCpError(""); }}
            title="Account settings"
            className="rounded-full border border-[var(--stroke)] bg-white/90 p-2 text-[var(--gray-text)] shadow-sm transition hover:text-[var(--navy-dark)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <span className="text-xs text-[var(--gray-text)]">
            {username}
          </span>
        </div>

        {/* Change-password modal */}
        {showChangePassword ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowChangePassword(false)}>
            <div className="w-full max-w-sm rounded-[24px] border border-[var(--stroke)] bg-white p-8 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Change Password</h2>
              {cpSuccess ? (
                <p className="mt-4 text-sm text-green-600">Password changed successfully.</p>
              ) : (
                <form onSubmit={(e) => void handleChangePassword(e)} className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    Current Password
                    <input type="password" value={cpOldPassword} onChange={(e) => setCpOldPassword(e.target.value)} required
                      className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    New Password
                    <input type="password" value={cpNewPassword} onChange={(e) => setCpNewPassword(e.target.value)} required
                      className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    Confirm New Password
                    <input type="password" value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)} required
                      className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary-blue)]" />
                  </label>
                  {cpError ? <p className="text-sm text-[var(--secondary-purple)]">{cpError}</p> : null}
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={cpSubmitting}
                      className="flex-1 rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60">
                      {cpSubmitting ? "Saving..." : "Change Password"}
                    </button>
                    <button type="button" onClick={() => setShowChangePassword(false)}
                      className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ) : null}
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
                onClick={() => void loadBoard(username, activeBoardId)}
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
                  onClick={() => void loadBoard(username, activeBoardId)}
                  className="ml-3 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)]"
                >
                  Retry
                </button>
              </div>
            ) : null}
            <KanbanBoard
              initialBoard={initialBoard}
              username={username}
              activeBoardId={activeBoardId}
              onBoardChange={handleBoardChange}
              onBoardSwitch={handleBoardSwitch}
            />
          </div>
        ) : null}
        {showBoard ? (
          <ChatSidebar
            username={username}
            boardId={activeBoardId}
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
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>

          <div className="mt-4 flex gap-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                mode === "login"
                  ? "bg-white text-[var(--navy-dark)] shadow-sm"
                  : "text-[var(--gray-text)]"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                mode === "register"
                  ? "bg-white text-[var(--navy-dark)] shadow-sm"
                  : "text-[var(--gray-text)]"
              }`}
            >
              Register
            </button>
          </div>

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
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                required
              />
            </label>
            {mode === "register" ? (
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Confirm Password
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  autoComplete="new-password"
                  required
                />
              </label>
            ) : null}
            {error ? (
              <p className="text-sm text-[var(--secondary-purple)]">{error}</p>
            ) : null}
            <button
              type="submit"
              data-testid="auth-submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting
                ? mode === "register" ? "Creating..." : "Signing in..."
                : mode === "register" ? "Create account" : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
