"use client";

import { useMemo, useState } from "react";
import { type BoardData } from "@/lib/kanban";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatResponse = {
  reply: string;
  boardUpdatesApplied: boolean;
  board: BoardData;
};

type ChatSidebarProps = {
  username: string;
  boardId?: string | null;
  onBoardUpdate: (board: BoardData) => void;
};

export const ChatSidebar = ({ username, boardId = null, onBoardUpdate }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastUpdateApplied, setLastUpdateApplied] = useState(false);

  const isEmpty = useMemo(() => messages.length === 0, [messages.length]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextPrompt = prompt.trim();
    if (!nextPrompt || isSending) {
      return;
    }

    const history = [...messages];
    const userMessage: ChatMessage = { role: "user", content: nextPrompt };

    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    setError("");
    setIsSending(true);

    try {
      const chatParams = new URLSearchParams({ user: username });
      if (boardId) chatParams.set("board_id", boardId);
      const response = await fetch(`/api/chat?${chatParams.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, history }),
      });

      const payload = (await response.json()) as ChatResponse | { error?: string };

      if (!response.ok) {
        throw new Error(
          payload && "error" in payload
            ? payload.error || "Chat request failed"
            : "Chat request failed"
        );
      }

      const chatPayload = payload as ChatResponse;
      setMessages((prev) => [...prev, { role: "assistant", content: chatPayload.reply }]);
      setLastUpdateApplied(chatPayload.boardUpdatesApplied);
      onBoardUpdate(chatPayload.board);
    } catch (requestError) {
      // Roll back the optimistic user message and restore the prompt so the user can retry
      setMessages(history);
      setPrompt(nextPrompt);
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Unable to contact AI assistant.";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="fixed bottom-4 right-4 top-4 z-20 w-[340px] rounded-2xl border border-[var(--stroke)] bg-white/95 p-4 shadow-[var(--shadow)] backdrop-blur xl:bottom-6 xl:right-6 xl:top-6">
      <div className="flex h-full flex-col">
        <div className="mb-3 border-b border-[var(--stroke)] pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            AI Chat
          </p>
          <p className="mt-2 text-sm font-semibold text-[var(--navy-dark)]">
            Ask to create, edit, or move cards.
          </p>
          {lastUpdateApplied ? (
            <p className="mt-1 text-xs text-[var(--primary-blue)]">
              Board updated from last response.
            </p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-3">
          {isEmpty ? (
            <p className="text-sm text-[var(--gray-text)]">
              Try: Move &quot;Design card layout&quot; to Review.
            </p>
          ) : (
            <ul className="space-y-3">
              {messages.map((message, index) => (
                <li
                  key={`${message.role}-${index}`}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    message.role === "user"
                      ? "bg-[var(--primary-blue)]/10 text-[var(--navy-dark)]"
                      : "bg-white text-[var(--gray-text)]"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                    {message.role}
                  </p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={handleSend} className="mt-3 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask AI to update your board"
              className="mt-2 h-24 w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </label>
          {error ? (
            <p className="text-xs text-[var(--secondary-purple)]">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={isSending}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </form>
      </div>
    </aside>
  );
};
