import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  username: string;
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, title: string, details: string) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, updates: Partial<Card>) => void;
  onDeleteColumn: (columnId: string) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  username,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onDeleteColumn,
}: KanbanColumnProps) => {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });
  const {
    setNodeRef: setSortableRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setSortableRef(node);
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex min-h-[460px] w-[260px] flex-shrink-0 flex-col rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-3 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]",
        isDragging && "opacity-50"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--stroke)] pb-3">
        <div
          className="h-1.5 w-6 flex-shrink-0 cursor-grab rounded-full bg-[var(--accent-yellow)] active:cursor-grabbing"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-display text-sm font-semibold text-[var(--navy-dark)] outline-none"
          aria-label="Column title"
        />
        <span className="flex-shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gray-text)]">
          {cards.length}
        </span>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDeleteColumn(column.id)}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-500 transition hover:bg-red-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-shrink-0 rounded-lg p-1 text-[var(--gray-text)] transition hover:text-red-400"
            title="Delete column"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              username={username}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={(cardId, updates) => onEditCard(cardId, updates)}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details) => onAddCard(column.id, title, details)}
      />
    </section>
  );
};
