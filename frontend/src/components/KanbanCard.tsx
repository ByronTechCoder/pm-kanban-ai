import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";
import { CardEditModal } from "@/components/CardEditModal";

const PRIORITY_COLORS: Record<Priority, string> = {
  none: "",
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

type KanbanCardProps = {
  card: Card;
  username: string;
  labelPresets?: string[];
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, updates: Partial<Card>) => void;
  onDuplicate: (cardId: string) => void;
  onArchive: (cardId: string) => void;
};

export const KanbanCard = ({ card, username, labelPresets = [], onDelete, onEdit, onDuplicate, onArchive }: KanbanCardProps) => {
  const [showEdit, setShowEdit] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityClass = PRIORITY_COLORS[card.priority ?? "none"];
  const hasLabels = card.labels && card.labels.trim().length > 0;
  const labelList = hasLabels ? card.labels.split(",").map((l) => l.trim()).filter(Boolean) : [];
  const isOverdue = card.dueDate
    ? new Date(card.dueDate) < new Date(new Date().toDateString())
    : false;

  return (
    <>
      <article
        ref={setNodeRef}
        style={style}
        className={clsx(
          "group relative rounded-2xl border bg-white px-4 py-3 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
          "transition-all duration-150",
          isOverdue ? "border-red-200" : "border-transparent",
          isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
        )}
        {...attributes}
        {...listeners}
        data-testid={`card-${card.id}`}
      >
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowEdit(true); }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label={`Edit ${card.title}`}
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDuplicate(card.id); }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
            aria-label={`Duplicate ${card.title}`}
            title="Duplicate card"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onArchive(card.id); }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-amber-500"
            aria-label={`Archive ${card.title}`}
            title="Archive card"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(card.id); }}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-red-500"
            aria-label={`Delete ${card.title}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {card.priority && card.priority !== "none" ? (
          <span className={clsx("mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", priorityClass)}>
            {card.priority}
          </span>
        ) : null}

        <h4 className="pr-14 font-display text-sm font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        <p className="mt-1.5 text-xs leading-5 text-[var(--gray-text)]">
          {card.details}
        </p>

        {card.dueDate ? (
          <p className={clsx("mt-2 flex items-center gap-1 text-[10px]", isOverdue ? "font-semibold text-red-500" : "text-[var(--gray-text)]")}>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {card.dueDate}
            {isOverdue ? <span className="ml-1">· Overdue</span> : null}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {labelList.map((label) => (
            <span key={label} className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--gray-text)]">
              {label}
            </span>
          ))}
          {card.estimate != null ? (
            <span className="ml-auto rounded-full bg-[var(--primary-blue)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--primary-blue)]">
              {card.estimate}pts
            </span>
          ) : null}
        </div>
      </article>

      {showEdit ? (
        <CardEditModal
          card={card}
          username={username}
          labelPresets={labelPresets}
          onSave={(updates) => { onEdit(card.id, updates); setShowEdit(false); }}
          onClose={() => setShowEdit(false)}
        />
      ) : null}
    </>
  );
};
