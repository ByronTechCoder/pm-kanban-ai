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
- **`components/KanbanBoard.tsx`** — main state container; manages columns/cards; dnd-kit drag-and-drop for cards AND columns; board selector dropdown; search/filter bar
- **`components/KanbanColumn.tsx`** — sortable column with add/delete; forwards username to cards
- **`components/KanbanCard.tsx`** — shows priority badge, due date, labels; edit modal trigger
- **`components/CardEditModal.tsx`** — tabbed modal: Details (title, priority, due date, labels) + Comments
- **`components/ChatSidebar.tsx`** — sends prompts to `/api/chat`; applies AI-suggested board mutations
- **`components/AuthGate.tsx`** — register/login tabs with API auth
- **`lib/kanban.ts`** — TypeScript types (`BoardData`, `Column`, `Card`, `Priority`), `moveCard`, `moveColumn`, `createId`
- Static export via `next.config.ts` (`output: "export"`); no SSR

### Backend (`backend/app/`)
- **`main.py`** — FastAPI app; all route handlers; OpenRouter AI call with structured output schema
- **`db.py`** — SQLite CRUD; DB path from `KANBAN_DB_PATH` env var (defaults to `backend/app/data.db`)
- SQLite tables: `users` (with password_hash/salt), `boards`, `columns`, `cards` (priority, due_date, labels), `comments`; cascading deletes

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hello` | Health check |
| POST | `/api/auth/register` | Register user (username, password ≥6 chars) |
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/boards?user=` | List all boards for user |
| POST | `/api/boards?user=` | Create a new board |
| PATCH | `/api/boards/{board_id}?user=` | Rename a board |
| DELETE | `/api/boards/{board_id}?user=` | Delete a board |
| GET | `/api/board?user=[&board_id=]` | Fetch board data (defaults to first board) |
| PUT | `/api/board?user=[&board_id=]` | Replace entire board |
| GET | `/api/cards/{card_id}/comments?user=` | List comments on a card |
| POST | `/api/cards/{card_id}/comments?user=` | Add a comment to a card |
| POST | `/api/chat?user=[&board_id=]` | AI chat; returns `{ reply, boardUpdatesApplied, board }` |

### Card fields
Cards support: `id`, `title`, `details`, `priority` (none/low/medium/high), `dueDate` (YYYY-MM-DD or null), `labels` (comma-separated string)

### Docker Build
Multi-stage: Node 20 Alpine builds frontend static assets → Python 3.12 slim runs backend with `uv`. Container exposes port 8000; FastAPI serves both API and static frontend.

### Testing Notes
- Backend tests use `tmp_path` pytest fixture to set `KANBAN_DB_PATH` — each test gets an isolated DB
- Run backend tests from the `backend/` directory: `cd backend && python -m pytest tests/`
- Playwright E2E tests target `http://127.0.0.1:3000` — run `npm run dev` first
- Live AI connectivity test is skipped unless `OPENROUTER_API_KEY` is set
