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
1. User authenticates via `AuthGate` → username stored in `localStorage` as `pm-user`
2. `KanbanBoard` loads board state via `GET /api/board?user=<username>`
3. Card/column changes → `PUT /api/board?user=<username>`
4. Chat messages → `POST /api/chat?user=<username>` → backend calls OpenRouter → structured JSON response includes optional `boardUpdates`
5. If `boardUpdates` returned, frontend applies them and re-saves the board

### Frontend (`frontend/src/`)
- **`app/page.tsx`** → renders `<AuthGate>` which wraps `<KanbanBoard>` + `<ChatSidebar>`
- **`components/KanbanBoard.tsx`** — main state container; manages columns/cards; dnd-kit drag-and-drop
- **`components/ChatSidebar.tsx`** — sends prompts to `/api/chat`; applies AI-suggested board mutations
- **`components/AuthGate.tsx`** — login form; hardcoded credentials (`user`/`password` for MVP)
- **`lib/kanban.ts`** — TypeScript types (`BoardData`, `Column`, `Card`), move logic, ID generation
- Static export via `next.config.ts` (`output: "export"`); no SSR

### Backend (`backend/app/`)
- **`main.py`** — FastAPI app; mounts `frontend/out/` as static files; all route handlers; OpenRouter AI call with structured output schema
- **`db.py`** — SQLite CRUD: `init_db()`, `get_or_create_board()`, `load_board()`, `replace_board()`; DB path from `KANBAN_DB_PATH` env var (defaults to `backend/app/data.db`)
- SQLite tables: `users`, `boards`, `columns`, `cards` with `order_index` for ordering and cascading deletes

### API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hello` | Health check |
| GET | `/api/board?user=` | Fetch user's board |
| PUT | `/api/board?user=` | Replace entire board |
| POST | `/api/chat?user=` | AI chat; returns `{ responseText, boardUpdates }` |

### Docker Build
Multi-stage: Node 20 Alpine builds frontend static assets → Python 3.12 slim runs backend with `uv`. Container exposes port 8000; FastAPI serves both API and static frontend.

### Testing Notes
- Backend tests use `tmp_path` pytest fixture to set `KANBAN_DB_PATH` — each test gets an isolated DB
- Playwright E2E tests target `http://127.0.0.1:3000` — run `npm run dev` first
- Live AI connectivity test is skipped unless `OPENROUTER_API_KEY` is set
