"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { createId, initialData, moveCard, moveColumn, type BoardData, type Card } from "@/lib/kanban";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";

type BoardSummary = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type KanbanBoardProps = {
  initialBoard?: BoardData;
  username?: string;
  activeBoardId?: string | null;
  onBoardChange?: (board: BoardData) => void;
  onBoardSwitch?: (boardId: string) => void;
};

export const KanbanBoard = ({
  initialBoard,
  username = "",
  activeBoardId = null,
  onBoardChange,
  onBoardSwitch = () => {},
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(
    () => initialBoard ?? initialData
  );
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [showBoardMenu, setShowBoardMenu] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [renameBoardTitle, setRenameBoardTitle] = useState("");
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterLabel, setFilterLabel] = useState<string>("");
  const [sortMode, setSortMode] = useState<"default" | "priority" | "due" | "title">("default");
  const [boardStats, setBoardStats] = useState<{
    total_cards: number;
    overdue_cards: number;
    high_priority_cards: number;
    total_estimate: number;
    estimated_cards: number;
  } | null>(null);
  const [labelPresets, setLabelPresets] = useState<string[]>([]);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [settingsPresetsInput, setSettingsPresetsInput] = useState("");
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [archivedCards, setArchivedCards] = useState<Array<{
    id: string; title: string; details: string; priority: string;
    dueDate: string | null; labels: string; columnTitle: string; archivedAt: string;
  }>>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    const rectHits = rectIntersection(args);
    if (rectHits.length > 0) return rectHits;
    return closestCenter(args);
  };

  const cardsById = useMemo(() => board.cards, [board.cards]);

  const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2, none: 3 };

  const filteredColumns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return board.columns.map((col) => {
      let ids = col.cardIds.filter((id) => {
        const card = board.cards[id];
        if (!card) return false;
        if (filterPriority !== "all" && card.priority !== filterPriority) return false;
        if (filterLabel.trim()) {
          const cardLabels = card.labels.split(",").map((l) => l.trim().toLowerCase());
          if (!cardLabels.includes(filterLabel.trim().toLowerCase())) return false;
        }
        if (q) {
          return (
            card.title.toLowerCase().includes(q) ||
            card.details.toLowerCase().includes(q) ||
            card.labels.toLowerCase().includes(q)
          );
        }
        return true;
      });
      if (sortMode !== "default") {
        ids = [...ids].sort((a, b) => {
          const ca = board.cards[a];
          const cb = board.cards[b];
          if (!ca || !cb) return 0;
          if (sortMode === "priority") return (PRIORITY_RANK[ca.priority] ?? 3) - (PRIORITY_RANK[cb.priority] ?? 3);
          if (sortMode === "due") {
            if (!ca.dueDate && !cb.dueDate) return 0;
            if (!ca.dueDate) return 1;
            if (!cb.dueDate) return -1;
            return ca.dueDate.localeCompare(cb.dueDate);
          }
          if (sortMode === "title") return ca.title.localeCompare(cb.title);
          return 0;
        });
      }
      return { ...col, cardIds: ids };
    });
  }, [board.columns, board.cards, searchQuery, filterPriority, filterLabel, sortMode]);

  const isFiltering = searchQuery.trim() !== "" || filterPriority !== "all" || filterLabel.trim() !== "";

  const allLabels = useMemo(() => {
    const labelSet = new Set<string>();
    Object.values(board.cards).forEach((card) => {
      if (card.labels) {
        card.labels.split(",").forEach((l) => {
          const trimmed = l.trim();
          if (trimmed) labelSet.add(trimmed);
        });
      }
    });
    return Array.from(labelSet).sort();
  }, [board.cards]);

  const loadStats = useCallback(async (boardId: string) => {
    if (!username || !boardId) return;
    try {
      const resp = await fetch(
        `/api/boards/${boardId}/stats?user=${encodeURIComponent(username)}`
      );
      if (resp.ok) {
        setBoardStats(await resp.json());
      }
    } catch {
      // ignore
    }
  }, [username]);

  const loadLabelPresets = useCallback(async (boardId: string) => {
    if (!username || !boardId) return;
    try {
      const resp = await fetch(
        `/api/boards/${boardId}/labels?user=${encodeURIComponent(username)}`
      );
      if (resp.ok) {
        setLabelPresets((await resp.json()) as string[]);
      }
    } catch {
      // ignore
    }
  }, [username]);

  // Load boards list
  const loadBoards = useCallback(async () => {
    try {
      const resp = await fetch(`/api/boards?user=${encodeURIComponent(username)}`);
      if (resp.ok) {
        const data = (await resp.json()) as BoardSummary[];
        setBoards(data);
      }
    } catch {
      // ignore
    }
  }, [username]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (activeBoardId) void loadStats(activeBoardId);
  }, [activeBoardId, loadStats, board]);

  useEffect(() => {
    if (activeBoardId) void loadLabelPresets(activeBoardId);
  }, [activeBoardId, loadLabelPresets]);

  useEffect(() => {
    if (onBoardChange) {
      onBoardChange(board);
    }
  }, [board, onBoardChange]);

  useEffect(() => {
    if (initialBoard) {
      setBoard(initialBoard);
    }
  }, [initialBoard]);

  const columnIds = useMemo(() => board.columns.map((c) => c.id), [board.columns]);

  // Keyboard shortcuts: "/" focuses search, "Escape" clears search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "/" && !isEditing) {
        e.preventDefault();
        const searchEl = document.getElementById("board-search");
        searchEl?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    if (!columnIds.includes(id)) {
      setActiveCardId(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId = over.id as string;

    if (columnIds.includes(activeId) && columnIds.includes(overId)) {
      // Column reorder
      setBoard((prev) => ({
        ...prev,
        columns: moveColumn(prev.columns, activeId, overId),
      }));
    } else {
      // Card move
      setBoard((prev) => ({
        ...prev,
        columns: moveCard(prev.columns, activeId, overId),
      }));
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    }));
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    const id = createId("card");
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [id]: { id, title, details: details || "No details yet.", priority: "none", dueDate: null, labels: "", estimate: null },
      },
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    }));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) => ({
      ...prev,
      cards: Object.fromEntries(
        Object.entries(prev.cards).filter(([id]) => id !== cardId)
      ),
      columns: prev.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    }));
  };

  const handleEditCard = (cardId: string, updates: Partial<Card>) => {
    setBoard((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...prev.cards[cardId], ...updates },
      },
    }));
  };

  const handleAddColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title) return;
    const id = createId("col");
    setBoard((prev) => ({
      ...prev,
      columns: [...prev.columns, { id, title, wipLimit: null, color: null, cardIds: [] }],
    }));
    setNewColumnTitle("");
    setAddingColumn(false);
  };

  const handleDeleteColumn = (columnId: string) => {
    setBoard((prev) => {
      const column = prev.columns.find((c) => c.id === columnId);
      if (!column) return prev;
      const nextCards = { ...prev.cards };
      column.cardIds.forEach((id) => delete nextCards[id]);
      return {
        ...prev,
        cards: nextCards,
        columns: prev.columns.filter((c) => c.id !== columnId),
      };
    });
  };

  const handleDuplicateCard = async (cardId: string) => {
    try {
      const resp = await fetch(
        `/api/cards/${cardId}/duplicate?user=${encodeURIComponent(username)}`,
        { method: "POST" }
      );
      if (resp.ok) {
        const newCard = (await resp.json()) as { id: string; title: string; details: string; priority: string; dueDate: string | null; labels: string };
        // Reload board to get accurate ordering
        const boardResp = await fetch(
          `/api/board?user=${encodeURIComponent(username)}&board_id=${encodeURIComponent(activeBoardId ?? "")}`
        );
        if (boardResp.ok) {
          setBoard(await boardResp.json() as typeof board);
        } else {
          // Fallback: add card locally to same column
          setBoard((prev) => {
            const col = prev.columns.find((c) => c.cardIds.includes(cardId));
            if (!col) return prev;
            return {
              ...prev,
              columns: prev.columns.map((c) =>
                c.id === col.id ? { ...c, cardIds: [...c.cardIds, newCard.id] } : c
              ),
              cards: { ...prev.cards, [newCard.id]: newCard as typeof prev.cards[string] },
            };
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const handleToggleArchiveView = async () => {
    if (!showArchiveView && activeBoardId) {
      try {
        const resp = await fetch(
          `/api/boards/${activeBoardId}/archive?user=${encodeURIComponent(username)}`
        );
        if (resp.ok) setArchivedCards(await resp.json());
      } catch { /* ignore */ }
    }
    setShowArchiveView((v) => !v);
  };

  const handleRestoreCard = async (cardId: string) => {
    try {
      const resp = await fetch(
        `/api/cards/${cardId}/restore?user=${encodeURIComponent(username)}&board_id=${encodeURIComponent(activeBoardId ?? "")}`,
        { method: "POST" }
      );
      if (resp.ok) {
        setArchivedCards((prev) => prev.filter((c) => c.id !== cardId));
        // Reload board to show the restored card
        if (activeBoardId) {
          const boardResp = await fetch(
            `/api/board?user=${encodeURIComponent(username)}&board_id=${encodeURIComponent(activeBoardId)}`
          );
          if (boardResp.ok) setBoard(await boardResp.json() as typeof board);
        }
      }
    } catch { /* ignore */ }
  };

  const handleArchiveCard = async (cardId: string) => {
    try {
      const resp = await fetch(
        `/api/cards/${cardId}/archive?user=${encodeURIComponent(username)}&board_id=${encodeURIComponent(activeBoardId ?? "")}`,
        { method: "POST" }
      );
      if (resp.ok) {
        setBoard((prev) => {
          const nextCards = { ...prev.cards };
          delete nextCards[cardId];
          return {
            ...prev,
            columns: prev.columns.map((col) => ({
              ...col,
              cardIds: col.cardIds.filter((id) => id !== cardId),
            })),
            cards: nextCards,
          };
        });
      }
    } catch {
      // ignore
    }
  };

  const handleSetWipLimit = (columnId: string, limit: number | null) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((c) =>
        c.id === columnId ? { ...c, wipLimit: limit } : c
      ),
    }));
  };

  const handleBulkArchive = async (columnId: string) => {
    if (!activeBoardId) return;
    try {
      const resp = await fetch(
        `/api/boards/${activeBoardId}/columns/${columnId}/archive-all?user=${encodeURIComponent(username)}`,
        { method: "POST" }
      );
      if (resp.ok) {
        // Remove all cards from the column in board state
        setBoard((prev) => {
          const col = prev.columns.find((c) => c.id === columnId);
          if (!col) return prev;
          const nextCards = { ...prev.cards };
          col.cardIds.forEach((id) => delete nextCards[id]);
          return {
            ...prev,
            columns: prev.columns.map((c) =>
              c.id === columnId ? { ...c, cardIds: [] } : c
            ),
            cards: nextCards,
          };
        });
      }
    } catch {
      // ignore
    }
  };

  const handleSetColor = (columnId: string, color: string | null) => {
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((c) =>
        c.id === columnId ? { ...c, color } : c
      ),
    }));
  };

  const handleCreateBoard = async () => {
    const title = newBoardTitle.trim();
    if (!title) return;
    setIsCreatingBoard(true);
    try {
      const resp = await fetch(`/api/boards?user=${encodeURIComponent(username)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (resp.ok) {
        const newBoard = (await resp.json()) as BoardSummary;
        setNewBoardTitle("");
        setShowBoardMenu(false);
        await loadBoards();
        onBoardSwitch(newBoard.id);
      }
    } finally {
      setIsCreatingBoard(false);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (boards.length <= 1) return; // Don't delete last board
    await fetch(`/api/boards/${boardId}?user=${encodeURIComponent(username)}`, {
      method: "DELETE",
    });
    await loadBoards();
    if (activeBoardId === boardId) {
      const remaining = boards.find((b) => b.id !== boardId);
      if (remaining) onBoardSwitch(remaining.id);
    }
  };

  const handleImportBoard = async (file: File) => {
    if (!activeBoardId) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const resp = await fetch(
        `/api/boards/${activeBoardId}/import?user=${encodeURIComponent(username)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        }
      );
      if (resp.ok) {
        const imported = await resp.json() as typeof board;
        setBoard(imported);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveLabelPresets = async (presetsStr: string) => {
    if (!activeBoardId) return;
    const presets = presetsStr.split(",").map((l) => l.trim()).filter(Boolean);
    try {
      const resp = await fetch(
        `/api/boards/${activeBoardId}/labels?user=${encodeURIComponent(username)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labels: presets }),
        }
      );
      if (resp.ok) {
        setLabelPresets(presets);
        setShowBoardSettings(false);
      }
    } catch {
      // ignore
    }
  };

  const handleRenameBoard = async (boardId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await fetch(`/api/boards/${boardId}?user=${encodeURIComponent(username)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    await loadBoards();
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;
  const currentBoardTitle = boards.find((b) => b.id === activeBoardId)?.title ?? "My Board";

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-4 pb-12 pt-8">
        <header className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-white/80 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex items-center gap-4">
            <h1 className="hidden font-display text-base font-semibold text-[var(--navy-dark)] lg:block">
              Kanban Studio
            </h1>
            <div className="hidden h-4 w-px bg-[var(--stroke)] lg:block" />
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowBoardMenu((v) => !v)}
                className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-left transition hover:bg-[var(--surface)]"
              >
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                    Board
                  </p>
                  <h1 className="mt-0.5 font-display text-xl font-semibold text-[var(--navy-dark)]">
                    {currentBoardTitle}
                  </h1>
                </div>
                <svg className="h-4 w-4 text-[var(--gray-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showBoardMenu ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-[var(--stroke)] bg-white shadow-[var(--shadow)]">
                  <div className="p-3">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                      Your Boards
                    </p>
                    <ul className="space-y-1">
                      {boards.map((b) => (
                        <li key={b.id} className="flex items-center gap-1">
                          {renamingBoardId === b.id ? (
                            <input
                              autoFocus
                              value={renameBoardTitle}
                              onChange={(e) => setRenameBoardTitle(e.target.value)}
                              className="min-w-0 flex-1 rounded-xl border border-[var(--primary-blue)] px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none"
                              onBlur={() => {
                                void handleRenameBoard(b.id, renameBoardTitle);
                                setRenamingBoardId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  void handleRenameBoard(b.id, renameBoardTitle);
                                  setRenamingBoardId(null);
                                }
                                if (e.key === "Escape") setRenamingBoardId(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setShowBoardMenu(false);
                                onBoardSwitch(b.id);
                              }}
                              className={`flex-1 rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-[var(--surface)] ${
                                b.id === activeBoardId
                                  ? "bg-[var(--primary-blue)]/10 text-[var(--primary-blue)]"
                                  : "text-[var(--navy-dark)]"
                              }`}
                            >
                              {b.title}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setRenamingBoardId(b.id); setRenameBoardTitle(b.title); }}
                            className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                            title="Rename board"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {boards.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => void handleDeleteBoard(b.id)}
                              className="rounded-lg p-1.5 text-[var(--gray-text)] transition hover:text-red-500"
                              title="Delete board"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 border-t border-[var(--stroke)] pt-3">
                      <div className="flex gap-2">
                        <input
                          value={newBoardTitle}
                          onChange={(e) => setNewBoardTitle(e.target.value)}
                          placeholder="New board name..."
                          className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleCreateBoard();
                          }}
                        />
                        <button
                          type="button"
                          disabled={isCreatingBoard || !newBoardTitle.trim()}
                          onClick={() => void handleCreateBoard()}
                          className="rounded-xl bg-[var(--primary-blue)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gray-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                id="board-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search cards… ("/" to focus)'
                aria-label="Search cards"
                className="rounded-xl border border-[var(--stroke)] bg-white py-1.5 pl-9 pr-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] w-48"
              />
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              aria-label="Filter by priority"
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">No priority</option>
            </select>
            {allLabels.length > 0 ? (
              <select
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
                aria-label="Filter by label"
                className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              >
                <option value="">All labels</option>
                {allLabels.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            ) : null}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
              aria-label="Sort cards"
              className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            >
              <option value="default">Default order</option>
              <option value="priority">Sort by priority</option>
              <option value="due">Sort by due date</option>
              <option value="title">Sort by title</option>
            </select>
            {isFiltering ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setFilterPriority("all"); setFilterLabel(""); }}
                className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--secondary-purple)] transition hover:bg-[var(--surface)]"
              >
                Clear
              </button>
            ) : null}
          </div>
        </header>

        {/* Board statistics bar */}
        {boardStats && activeBoardId ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-5 py-3 text-xs backdrop-blur">
            <span className="font-semibold text-[var(--navy-dark)]">
              {boardStats.total_cards} cards
            </span>
            {boardStats.overdue_cards > 0 ? (
              <span className="flex items-center gap-1 font-semibold text-red-500">
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {boardStats.overdue_cards} overdue
              </span>
            ) : (
              <span className="text-green-600 font-semibold">No overdue cards</span>
            )}
            {boardStats.high_priority_cards > 0 ? (
              <span className="font-semibold text-red-600">
                {boardStats.high_priority_cards} high priority
              </span>
            ) : null}
            {boardStats.estimated_cards > 0 ? (
              <span className="text-[var(--primary-blue)] font-semibold">
                {boardStats.total_estimate}pts total
              </span>
            ) : null}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => { setSettingsPresetsInput(labelPresets.join(", ")); setShowBoardSettings(true); }}
                className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                title="Board settings"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => void handleToggleArchiveView()}
                className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Archive
              </button>
              <a
                href={`/api/boards/${activeBoardId}/export?user=${encodeURIComponent(username)}`}
                download={`board-${activeBoardId}.json`}
                className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Export
              </a>
              <label className="cursor-pointer rounded-xl border border-[var(--stroke)] px-3 py-1.5 font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]" title="Import board JSON">
                Import
                <input
                  type="file"
                  accept=".json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportBoard(file);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        {/* Board settings modal */}
        {showBoardSettings ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowBoardSettings(false)}
          >
            <div
              className="w-full max-w-sm rounded-[24px] border border-[var(--stroke)] bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">Board Settings</h2>
                <button
                  type="button"
                  onClick={() => setShowBoardSettings(false)}
                  className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Label Presets
                  <textarea
                    value={settingsPresetsInput}
                    onChange={(e) => setSettingsPresetsInput(e.target.value)}
                    rows={3}
                    placeholder="bug, feature, urgent, design"
                    className="mt-2 w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  />
                  <span className="mt-1 block text-[10px] normal-case font-normal text-[var(--gray-text)]">
                    Comma-separated. These appear as quick-select chips in the card editor.
                  </span>
                </label>
                {settingsPresetsInput.trim() ? (
                  <div className="flex flex-wrap gap-1.5">
                    {settingsPresetsInput.split(",").map((l) => l.trim()).filter(Boolean).map((label) => (
                      <span key={label} className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--gray-text)]">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveLabelPresets(settingsPresetsInput)}
                    className="flex-1 rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBoardSettings(false)}
                    className="flex-1 rounded-full border border-[var(--stroke)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Click outside to close board menu */}
        {showBoardMenu ? (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowBoardMenu(false)}
          />
        ) : null}

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="flex gap-3 overflow-x-auto pb-2">
            <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
              {filteredColumns.map((column) => (
                <KanbanColumn
                  key={column.id}
                  column={column}
                  cards={column.cardIds.map((cardId) => board.cards[cardId]).filter(Boolean)}
                  username={username}
                  labelPresets={labelPresets}
                  onRename={handleRenameColumn}
                  onAddCard={handleAddCard}
                  onDeleteCard={handleDeleteCard}
                  onEditCard={handleEditCard}
                  onDeleteColumn={handleDeleteColumn}
                  onDuplicateCard={handleDuplicateCard}
                  onArchiveCard={handleArchiveCard}
                  onBulkArchive={handleBulkArchive}
                  onSetWipLimit={handleSetWipLimit}
                  onSetColor={handleSetColor}
                />
              ))}
            </SortableContext>
            <div className="flex-shrink-0">
              {addingColumn ? (
                <div className="flex w-[260px] flex-col gap-2 rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-3">
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    placeholder="Column name..."
                    className="rounded-xl border border-[var(--stroke)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddColumn();
                      if (e.key === "Escape") { setAddingColumn(false); setNewColumnTitle(""); }
                    }}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleAddColumn()}
                      className="flex-1 rounded-xl bg-[var(--primary-blue)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                    >
                      Add Column
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingColumn(false); setNewColumnTitle(""); }}
                      className="rounded-xl border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  className="flex h-12 w-[260px] items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--stroke)] text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Column
                </button>
              )}
            </div>
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Archive panel */}
        {showArchiveView ? (
          <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                Archived Cards
                <span className="ml-2 rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-xs font-normal text-[var(--gray-text)]">
                  {archivedCards.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setShowArchiveView(false)}
                className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface-strong)]"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {archivedCards.length === 0 ? (
              <p className="text-sm text-[var(--gray-text)]">No archived cards.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {archivedCards.map((card) => (
                  <div
                    key={card.id}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--stroke)] bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--navy-dark)]">{card.title}</span>
                      <span className="flex-shrink-0 rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--gray-text)]">
                        {card.columnTitle}
                      </span>
                    </div>
                    {card.details ? (
                      <p className="line-clamp-2 text-xs text-[var(--gray-text)]">{card.details}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleRestoreCard(card.id)}
                      className="mt-auto self-start rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
};
