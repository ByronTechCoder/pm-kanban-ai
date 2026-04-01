"use client";

import { useState } from "react";
import type { Card, Priority } from "@/lib/kanban";

type CardEditModalProps = {
  card: Card;
  onSave: (updates: Partial<Card>) => void;
  onClose: () => void;
};

export const CardEditModal = ({ card, onSave, onClose }: CardEditModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [priority, setPriority] = useState<Priority>(card.priority ?? "none");
  const [dueDate, setDueDate] = useState(card.dueDate ?? "");
  const [labels, setLabels] = useState(card.labels ?? "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      details: details.trim(),
      priority,
      dueDate: dueDate.trim() || null,
      labels: labels.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[24px] border border-[var(--stroke)] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
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

          <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Labels
            <input
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              placeholder="bug, urgent, frontend"
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <span className="mt-1 block text-[10px] normal-case font-normal text-[var(--gray-text)]">
              Comma-separated
            </span>
          </label>

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
      </div>
    </div>
  );
};
