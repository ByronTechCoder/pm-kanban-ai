# Project Plan

This plan breaks the work into parts with checklists, tests, and success criteria. Each part is completed only after the user signs off.

## Part 1: Plan

Checklist
- [ ] Expand this document with detailed steps for Parts 2-10, including checklists, tests, and success criteria.
- [ ] Create a frontend code summary in frontend/AGENTS.md describing the current implementation and tests.
- [ ] Review plan with user and capture approval.

Tests
- None.

Success criteria
- This plan is complete, accurate, and approved by the user.

## Part 2: Scaffolding

Checklist
- [ ] Add Docker configuration for running the app locally.
- [ ] Implement FastAPI backend in backend/.
- [ ] Add scripts in scripts/ to start and stop the server on Mac, Windows, and Linux.
- [ ] Serve a simple static "hello world" HTML at `/`.
- [ ] Add a sample API route and confirm it is reachable from the static page.

Tests
- Manual: start container, load `/` in browser, confirm "hello world" renders.
- Manual: invoke sample API route from the static page and confirm response.

Success criteria
- Container starts locally.
- `/` serves the static HTML page.
- Sample API route responds successfully from the page.

## Part 3: Add in Frontend

Checklist
- [ ] Build the frontend inside frontend/ as a static output.
- [ ] Serve the static frontend at `/` via FastAPI.
- [ ] Confirm static assets are served correctly (CSS, fonts, JS).
- [ ] Ensure existing frontend tests still pass.

Tests
- Unit: `npm run test:unit` in frontend/.
- E2E: `npm run test:e2e` in frontend/.
- Manual: load `/` and verify the Kanban board renders.

Success criteria
- `/` shows the existing Kanban board UI.
- Frontend unit and e2e tests pass.

## Part 4: Fake user sign in

Checklist
- [ ] Add a login screen at `/` when not authenticated.
- [ ] Validate credentials against hardcoded "user" / "password".
- [ ] Add log out action and session clearing.
- [ ] Protect Kanban view behind authentication.

Tests
- Unit: login form validation and auth state transitions.
- E2E: login success, login failure, logout flow.

Success criteria
- Unauthenticated users see login screen.
- Correct credentials reveal the Kanban board.
- Logout returns to login screen.

## Part 5: Database modeling

Checklist
- [ ] Propose SQLite schema for users, board, columns, cards, and positions.
- [ ] Save the schema as JSON in docs/.
- [ ] Document database approach in docs/.
- [ ] Review schema with user and capture approval.

Tests
- None.

Success criteria
- Schema JSON and documentation are complete and approved.

## Part 6: Backend API

Checklist
- [ ] Implement database initialization (create if missing).
- [ ] Add API endpoints to read and update a user's board.
- [ ] Add minimal auth guard using the fake login session.
- [ ] Add backend unit tests for CRUD flows.

Tests
- Backend unit tests for read, update, move, create, delete operations.

Success criteria
- API returns consistent board data.
- API updates persist to SQLite.
- Backend tests pass.

## Part 7: Frontend + Backend

Checklist
- [ ] Replace frontend local state with API-backed data.
- [ ] Save edits, moves, and new cards via API.
- [ ] Handle loading and error states.
- [ ] Update frontend tests for API-backed behavior.

Tests
- Unit: frontend state helpers for API data handling.
- Integration/E2E: create, move, edit, delete cards using real API.

Success criteria
- Kanban state persists across refreshes.
- User actions update the database via API.
- Tests pass.

## Part 8: AI connectivity

Checklist
- [x] Add a backend-only API route at `POST /api/chat` to call OpenRouter using `openai/gpt-oss-120b`.
- [x] Read `OPENROUTER_API_KEY` from .env.
- [x] Add a minimal live "2+2" connectivity test (no mocking).

Tests
- Backend test for OpenRouter call using a gated live test against the real API.

Success criteria
- API returns a valid response from OpenRouter.

## Part 9: AI with structured outputs

Checklist
- [x] Extend AI API route to send board JSON, user prompt, and conversation history.
- [x] Define and validate the Structured Output schema (response text + optional board updates).
- [x] Apply updates to the board when present.

Tests
- Backend tests for schema validation and board updates.
- Integration test for prompt leading to board change.

Success criteria
- AI responses are schema-valid.
- Optional board updates are applied reliably.

## Part 10: AI chat UI

Checklist
- [x] Add sidebar chat UI integrated with the backend AI route.
- [x] Render conversation history and assistant responses.
- [x] Apply AI-driven board updates and refresh UI state.
- [x] Add tests for chat UI behavior and update flow.

Tests
- Unit: chat state reducer or hooks.
- E2E: send prompt, receive response, confirm optional board update.

Success criteria
- Chat UI works end-to-end.
- Board updates from AI appear immediately.
- Tests pass.

## Design decisions (current)

- Auth state is stored as `pm-user` in localStorage; the backend uses a `user` query param for MVP auth.
- Frontend loads and saves the board via `GET /api/board?user=...` and `PUT /api/board?user=...`.
- Backend seeds a single board per user using the current frontend `initialData` when no data exists.
- Static assets are mounted only when `frontend/out` exists to keep backend tests isolated.
- Drag and drop uses a pointer-first collision strategy (`pointerWithin`, then `rectIntersection`, then `closestCenter`) to reduce snap-back drops.
- Part 8 is backend-only; no frontend chat wiring is included until Part 10.
- MVP error shape for AI route is simple JSON: `{ "error": "..." }`.