"use client";

import { useCallback, useEffect, useState } from "react";
import type { Card, Priority } from "@/lib/kanban";

type CardEditModalProps = {
  card: Card;
  username: string;
  labelPresets?: string[];
  onSave: (updates: Partial<Card>) => void;
  onClose: () => void;
};

type Comment = {
  id: string;
  card_id: string;
  author: string;
  text: string;
  created_at: string;
};

type ChecklistItem = {
  id: string;
  card_id: string;
  text: string;
  checked: boolean;
  order_index: number;
  created_at: string;
};

export const CardEditModal = ({ card, username, labelPresets = [], onSave, onClose }: CardEditModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority>(card.priority ?? "none");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState(card.labels ?? "");
  const [estimate, setEstimate] = useState<string>(card.estimate != null ? String(card.estimate) : "");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [activeTab, setActiveTab] = useState<"details" | "comments" | "checklist">("details");

  const loadComments = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/cards/${card.id}/comments?user=${encodeURIComponent(username)}`
      );
      if (resp.ok) {
        setComments((await resp.json()) as Comment[]);
      }
    } catch {
      // ignore
    }
  }, [card.id, username]);

  const loadChecklist = useCallback(async () => {
    try {
      const resp = await fetch(
        `/api/cards/${card.id}/checklist?user=${encodeURIComponent(username)}`
      );
      if (resp.ok) {
        setChecklist((await resp.json()) as ChecklistItem[]);
      }
    } catch {
      // ignore
    }
  }, [card.id, username]);

  useEffect(() => {
    void loadComments();
    void loadChecklist();
  }, [loadComments, loadChecklist]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const estimateVal = estimate.trim();
    onSave({
      title: title.trim(),
      details: details.trim(),
      priority,
      dueDate: dueDate.trim() || null,
      labels: labels.trim(),
      estimate: estimateVal ? (parseInt(estimateVal, 10) || null) : null,
    });
  };

  const handlePostComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    setIsPostingComment(true);
    try {
      const resp = await fetch(
        `/api/cards/${card.id}/comments?user=${encodeURIComponent(username)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        }
      );
      if (resp.ok) {
        setNewComment("");
        void loadComments();
      }
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleAddChecklistItem = async () => {
    const text = newChecklistText.trim();
    if (!text) return;
    const resp = await fetch(
      `/api/cards/${card.id}/checklist?user=${encodeURIComponent(username)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }
    );
    if (resp.ok) {
      setNewChecklistText("");
      void loadChecklist();
    }
  };

  const handleToggleItem = async (item: ChecklistItem) => {
    const resp = await fetch(
      `/api/checklist/${item.id}?user=${encodeURIComponent(username)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked: !item.checked }),
      }
    );
    if (resp.ok) void loadChecklist();
  };

  const handleDeleteChecklistItem = async (itemId: string) => {
    await fetch(
      `/api/checklist/${itemId}?user=${encodeURIComponent(username)}`,
      { method: "DELETE" }
    );
    void loadChecklist();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[24px] border border-[var(--stroke)] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 pt-6 pb-4">
          <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
            Edit Card
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 border-b border-[var(--stroke)] px-6">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition border-b-2 -mb-px ${
              activeTab === "details"
                ? "border-[var(--primary-blue)] text-[var(--primary-blue)]"
                : "border-transparent text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            }`}
          >
            Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("comments")}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition border-b-2 -mb-px ${
              activeTab === "comments"
                ? "border-[var(--primary-blue)] text-[var(--primary-blue)]"
                : "border-transparent text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            }`}
          >
            Comments
            {comments.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--gray-text)]">
                {comments.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("checklist")}
            className={`px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition border-b-2 -mb-px ${
              activeTab === "checklist"
                ? "border-[var(--primary-blue)] text-[var(--primary-blue)]"
                : "border-transparent text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            }`}
          >
            Checklist
            {checklist.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--gray-text)]">
                {checklist.filter((i) => i.checked).length}/{checklist.length}
              </span>
            ) : null}
          </button>
        </div>

        <div className="p-6">
          {activeTab === "details" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Title
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  required
                />
              </label>

              <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Details
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Priority
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Due Date
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Labels
                  <input
                    value={labels}
                    onChange={(e) => setLabels(e.target.value)}
                    placeholder="bug, frontend"
                    className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                  <span className="mt-1 block text-[10px] normal-case font-normal text-[var(--gray-text)]">
                    Comma-separated
                  </span>
                  {labelPresets.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {labelPresets.map((preset) => {
                        const active = labels.split(",").map((l) => l.trim()).includes(preset);
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              const current = labels.split(",").map((l) => l.trim()).filter(Boolean);
                              if (active) {
                                setLabels(current.filter((l) => l !== preset).join(", "));
                              } else {
                                setLabels([...current, preset].join(", "));
                              }
                            }}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                              active
                                ? "bg-[var(--primary-blue)] text-white"
                                : "bg-[var(--surface)] text-[var(--gray-text)] hover:bg-[var(--stroke)]"
                            }`}
                          >
                            {preset}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </label>
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Estimate (pts)
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                    placeholder="—"
                    className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                  <span className="mt-1 block text-[10px] normal-case font-normal text-[var(--gray-text)]">
                    Story points
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : activeTab === "comments" ? (
            <div className="flex flex-col gap-4">
              <div className="max-h-64 space-y-3 overflow-y-auto">
                {comments.length === 0 ? (
                  <p className="text-sm text-[var(--gray-text)]">No comments yet.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--navy-dark)]">{c.author}</span>
                        <span className="text-[10px] text-[var(--gray-text)]">
                          {new Date(c.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--gray-text)]">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handlePostComment();
                  }}
                />
                <button
                  type="button"
                  disabled={isPostingComment || !newComment.trim()}
                  onClick={() => void handlePostComment()}
                  className="rounded-xl bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {checklist.length > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.round((checklist.filter((i) => i.checked).length / checklist.length) * 100)}%` }}
                  />
                </div>
              )}
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {checklist.length === 0 ? (
                  <p className="text-sm text-[var(--gray-text)]">No checklist items yet.</p>
                ) : (
                  checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 group">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => void handleToggleItem(item)}
                        className="h-4 w-4 cursor-pointer rounded accent-green-500"
                      />
                      <span className={`flex-1 text-sm ${item.checked ? "line-through text-[var(--gray-text)]" : "text-[var(--navy-dark)]"}`}>
                        {item.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDeleteChecklistItem(item.id)}
                        className="invisible rounded p-0.5 text-[var(--gray-text)] hover:text-red-500 group-hover:visible"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="flex gap-2">
                <input
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  placeholder="Add an item..."
                  className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAddChecklistItem();
                  }}
                />
                <button
                  type="button"
                  disabled={!newChecklistText.trim()}
                  onClick={() => void handleAddChecklistItem()}
                  className="rounded-xl bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
