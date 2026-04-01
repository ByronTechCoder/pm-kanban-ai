import clsx from "clsx";
import type { Card, Priority } from "@/lib/kanban";

const PRIORITY_COLORS: Record<Priority, string> = {
  none: "",
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
};

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => {
  const priorityClass = PRIORITY_COLORS[card.priority ?? "none"];
  const labelList = card.labels
    ? card.labels.split(",").map((l) => l.trim()).filter(Boolean)
    : [];

  return (
    <article className="rounded-2xl border border-transparent bg-white px-4 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
      {card.priority && card.priority !== "none" ? (
        <span className={clsx("mb-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", priorityClass)}>
          {card.priority}
        </span>
      ) : null}
      <h4 className="font-display text-sm font-semibold text-[var(--navy-dark)]">
        {card.title}
      </h4>
      <p className="mt-1 text-xs leading-5 text-[var(--gray-text)] line-clamp-2">
        {card.details}
      </p>
      {card.dueDate ? (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--gray-text)]">
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {card.dueDate}
        </p>
      ) : null}
      {labelList.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {labelList.slice(0, 3).map((label) => (
            <span key={label} className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--gray-text)]">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
};
