# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A containerized Kanban board MVP with AI chat assistance. The FastAPI backend serves a statically-exported Next.js frontend. AI features use OpenRouter (requires `OPENROUTER_API_KEY` in `.env`).

## Commands

### Frontend (`cd frontend`)
```bash
npm run dev          # Dev server on port 3000
npm run build        # Static export to out/
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests
npm run test:unit:watch
npm run test:e2e     # Playwright E2E (requires server on port 3000)
npm run test:all     # Unit + E2E
```

Run a single Vitest test file:
```bash
npx vitest run src/components/AuthGate.test.tsx
```

### Backend (from project root)
```bash
pytest backend/tests/                         # All backend tests
pytest backend/tests/test_board_api.py        # Single file
pytest -k "test_chat_live_connectivity"       # Requires OPENROUTER_API_KEY
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000  # Run locally
```

### Docker (recommended for full integration)
```bash
./scripts/start.sh   # Build image and run container on port 8000
./scripts/stop.sh    # Stop and remove container
```

## Architecture

### Data Flow
1. User registers/logs in via `AuthGate` → API auth with PBKDF2 hashed passwords; username stored in `localStorage` as `pm-user`
2. `KanbanBoard` lists boards via `GET /api/boards?user=`, switches active board
3. Board state loaded via `GET /api/board?user=&board_id=`
4. Card/column changes → `PUT /api/board?user=&board_id=`
5. Chat messages → `POST /api/chat?user=&board_id=` → backend calls OpenRouter → structured JSON response includes optional `boardUpdates`
6. If `boardUpdates` returned, frontend applies them and re-saves the board

### Frontend (`frontend/src/`)
- **`app/page.tsx`** → renders `<AuthGate>` which wraps `<KanbanBoard>` + `<ChatSidebar>`
- **`components/KanbanBoard.tsx`** — main state container; boards switcher with create/rename/delete; dnd-kit for cards AND columns; search/filter/sort bar; stats bar; board settings, archive, activity log, export/import panels
- **`components/KanbanColumn.tsx`** — sortable column; WIP limit (click badge to edit); color picker; bulk-archive button; forwards `labelPresets` to cards
- **`components/KanbanCard.tsx`** — priority badge, due date, labels, estimate badge; duplicate/archive/delete buttons (hover); opens `CardEditModal`
- **`components/CardEditModal.tsx`** — tabbed modal: Details (title, priority, due date, labels with preset chips, estimate), Comments, Checklist (progress bar + items)
- **`components/ChatSidebar.tsx`** — sends prompts to `/api/chat`; applies AI-suggested board mutations
- **`components/AuthGate.tsx`** — register/login tabs; change-password gear button
- **`lib/kanban.ts`** — TypeScript types (`BoardData`, `Column` with wipLimit/color, `Card` with estimate, `Priority`), `moveCard`, `moveColumn`, `createId`
- Static export via `next.config.ts` (`output: "export"`); no SSR; keyboard shortcut "/" focuses search

### Backend (`backend/app/`)
- **`main.py`** — FastAPI app; all route handlers; OpenRouter AI call with structured output schema
- **`db.py`** — SQLite CRUD; DB path from `KANBAN_DB_PATH` env var (defaults to `backend/app/data.db`)
- SQLite tables: `users`, `boards` (label_presets), `columns` (wip_limit, color), `cards` (priority, due_date, labels, estimate, archived), `comments`, `checklist_items`, `activity_log`

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hello` | Health check |
| POST | `/api/auth/register` | Register user (username, password ≥6 chars) |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/change-password?user=` | Change password (old + new) |
| GET | `/api/boards?user=` | List all boards for user |
| POST | `/api/boards?user=` | Create a new board |
| PATCH | `/api/boards/{board_id}?user=` | Rename a board |
| DELETE | `/api/boards/{board_id}?user=` | Delete a board |
| GET | `/api/boards/{board_id}/stats?user=` | Board statistics (counts, overdue, estimates) |
| GET | `/api/boards/{board_id}/labels?user=` | Get board label presets |
| PUT | `/api/boards/{board_id}/labels?user=` | Set board label presets |
| GET | `/api/boards/{board_id}/archive?user=` | List archived cards |
| POST | `/api/boards/{board_id}/columns/{col_id}/archive-all?user=` | Bulk archive all cards in column |
| GET | `/api/boards/{board_id}/activity?user=[&limit=50]` | Get activity log |
| POST | `/api/boards/{board_id}/activity?user=` | Log a custom activity entry |
| GET | `/api/boards/{board_id}/export?user=` | Export board as JSON |
| POST | `/api/boards/{board_id}/import?user=` | Import board from JSON |
| GET | `/api/board?user=[&board_id=]` | Fetch board data (defaults to first board) |
| PUT | `/api/board?user=[&board_id=]` | Replace entire board |
| GET | `/api/cards/{card_id}/comments?user=` | List comments on a card |
| POST | `/api/cards/{card_id}/comments?user=` | Add a comment to a card |
| POST | `/api/cards/{card_id}/duplicate?user=` | Duplicate a card |
| POST | `/api/cards/{card_id}/archive?user=[&board_id=]` | Archive a card (soft-delete) |
| POST | `/api/cards/{card_id}/restore?user=[&board_id=]` | Restore an archived card |
| GET | `/api/cards/{card_id}/checklist?user=` | List checklist items |
| POST | `/api/cards/{card_id}/checklist?user=` | Add checklist item |
| PATCH | `/api/checklist/{item_id}?user=` | Update checklist item (text/checked) |
| DELETE | `/api/checklist/{item_id}?user=` | Delete checklist item |
| POST | `/api/chat?user=[&board_id=]` | AI chat; returns `{ reply, boardUpdatesApplied, board }` |

### Card fields
Cards support: `id`, `title`, `details`, `priority` (none/low/medium/high), `dueDate` (YYYY-MM-DD or null), `labels` (comma-separated string), `estimate` (integer points or null)

### Column fields
Columns support: `id`, `title`, `wipLimit` (integer or null), `color` (hex string or null), `cardIds` (ordered list)

### Docker Build
Multi-stage: Node 20 Alpine builds frontend static assets → Python 3.12 slim runs backend with `uv`. Container exposes port 8000; FastAPI serves both API and static frontend.

### Testing Notes
- Backend tests use `tmp_path` pytest fixture to set `KANBAN_DB_PATH` — each test gets an isolated DB
- Run backend tests from project root: `python -m pytest backend/tests/`
- 125 backend tests across 14 test files
- 34 frontend unit tests across 5 test files
- Playwright E2E tests target `http://127.0.0.1:3000` — run `npm run dev` first
- Live AI connectivity test is skipped unless `OPENROUTER_API_KEY` is set
