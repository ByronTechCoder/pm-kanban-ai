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
  onDuplicateCard: (cardId: string) => void;
  onArchiveCard: (cardId: string) => void;
  onSetWipLimit: (columnId: string, limit: number | null) => void;
  onSetColor: (columnId: string, color: string | null) => void;
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
  onDuplicateCard,
  onArchiveCard,
  onSetWipLimit,
  onSetColor,
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
  const [showWipInput, setShowWipInput] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const COLUMN_COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
  const [wipInputValue, setWipInputValue] = useState(
    column.wipLimit != null ? String(column.wipLimit) : ""
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setSortableRef(node);
  };

  const isOverWip = column.wipLimit != null && cards.length > column.wipLimit;

  const handleWipSave = () => {
    const val = wipInputValue.trim();
    if (val === "") {
      onSetWipLimit(column.id, null);
    } else {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n > 0) onSetWipLimit(column.id, n);
    }
    setShowWipInput(false);
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex min-h-[460px] w-[260px] flex-shrink-0 flex-col rounded-2xl border bg-[var(--surface-strong)] p-3 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]",
        isDragging && "opacity-50",
        isOverWip ? "border-red-400" : "border-[var(--stroke)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-[var(--stroke)] pb-3">
        <div
          className="h-1.5 w-6 flex-shrink-0 cursor-grab rounded-full active:cursor-grabbing"
          style={{ backgroundColor: column.color ?? "var(--accent-yellow)" }}
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
        {/* Card count / WIP badge */}
        {showWipInput ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={wipInputValue}
              onChange={(e) => setWipInputValue(e.target.value)}
              placeholder="∞"
              className="w-14 rounded border border-[var(--stroke)] px-1.5 py-0.5 text-[10px] text-[var(--navy-dark)] outline-none"
              onKeyDown={(e) => { if (e.key === "Enter") handleWipSave(); if (e.key === "Escape") setShowWipInput(false); }}
              autoFocus
            />
            <button type="button" onClick={handleWipSave} className="text-[10px] font-semibold text-[var(--primary-blue)]">OK</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setWipInputValue(column.wipLimit != null ? String(column.wipLimit) : ""); setShowWipInput(true); }}
            title={column.wipLimit != null ? `WIP limit: ${column.wipLimit}` : "Set WIP limit"}
            className={clsx(
              "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold transition",
              isOverWip
                ? "bg-red-100 text-red-500"
                : "bg-[var(--surface)] text-[var(--gray-text)] hover:bg-[var(--stroke)]"
            )}
          >
            {cards.length}{column.wipLimit != null ? `/${column.wipLimit}` : ""}
            {isOverWip && " ⚠"}
          </button>
        )}
        {/* Color picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColorPicker((v) => !v)}
            className="flex-shrink-0 rounded-lg p-1 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            title="Column color"
          >
            <div className="h-3 w-3 rounded-full border border-[var(--stroke)]" style={{ backgroundColor: column.color ?? "transparent" }} />
          </button>
          {showColorPicker ? (
            <div className="absolute right-0 top-7 z-20 flex gap-1.5 rounded-xl border border-[var(--stroke)] bg-white p-2 shadow-lg">
              {COLUMN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { onSetColor(column.id, c); setShowColorPicker(false); }}
                  className="h-5 w-5 rounded-full transition hover:scale-110"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button
                type="button"
                onClick={() => { onSetColor(column.id, null); setShowColorPicker(false); }}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--stroke)] text-[8px] text-[var(--gray-text)] transition hover:scale-110"
                title="Remove color"
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
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
              onDuplicate={(cardId) => onDuplicateCard(cardId)}
              onArchive={(cardId) => onArchiveCard(cardId)}
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
