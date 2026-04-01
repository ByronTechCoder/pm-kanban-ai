# Code Review

**Date:** 2026-04-01  
**Scope:** Full codebase — backend, frontend, data layer  
**Verdict:** Solid MVP. A few things that will bite you the moment a second person looks at it.

---

## Security

### Critical

**`AuthGate.tsx:9-10` — Client-side credentials**  
`VALID_USERNAME = "user"` and `VALID_PASSWORD = "password"` are hardcoded in JavaScript that ships to the browser. Anyone who opens DevTools can read them. The login form is theatre; it provides no actual protection. Even for an MVP, this is worth flagging loudly.

**`AuthGate.tsx`, `main.py:89-93` — Username is both identity and authorization**  
The `?user=` query parameter is the only thing standing between one user's board and another's. There is no session token, no cookie, no server-side check that the caller is who they claim to be. Anyone who can reach the API can read or overwrite any board by guessing a username (spoiler: "user" is not hard to guess).

**No CSRF protection**  
The `PUT /api/board` and `POST /api/chat` endpoints accept JSON from any origin with no CSRF token. Not critical while auth is this broken anyway, but worth noting for when it gets fixed.

---

## Backend

### `main.py`

**Line 222 — Synchronous HTTP in an async app**  
`requests.post(...)` blocks the entire event loop for the duration of every AI call (up to 60 seconds per the timeout). FastAPI is async; use `httpx.AsyncClient` instead. Under any concurrent load, one slow OpenRouter call will freeze all other requests.

**Lines 63-76 — `ChatRequest` has two names for the same field**  
`prompt` and `message` are both accepted, with a validator that normalizes `message` → `prompt`. This is the smell of a half-finished migration. Pick one and delete the other.

**Lines 95-103 — `_validate_board_integrity` only checks one direction**  
It verifies that every `cardId` in a column exists in `cards`, but it does not check for orphaned cards — cards in the `cards` dict that aren't referenced by any column. An AI response (or a malicious PUT) can silently accumulate ghost cards in the DB.

**Line 201 — API key read on every request**  
`os.getenv("OPENROUTER_API_KEY")` is called inside the handler. It works, but the key should be read once at startup and fail fast if missing, rather than returning a 500 on the first chat attempt after the app is already running.

**No input length limits**  
`prompt`, card `title`, and card `details` have no maximum length enforced in Pydantic models. A sufficiently motivated user (or a misbehaving AI) can write a novel into a card title or send a 100KB prompt to OpenRouter.

### `db.py`

**Lines 181-185 — Redundant manual card deletion**  
`replace_board` explicitly deletes cards before deleting columns, even though `PRAGMA foreign_keys = ON` and `ON DELETE CASCADE` are already set up. The manual delete is harmless but misleading — it implies the cascade can't be trusted.

**Lines 136-142 — TOCTOU in `get_or_create_board`**  
`_get_user_id` checks for existence then inserts in separate steps. Under concurrent requests for the same new username, two inserts could race. SQLite's `UNIQUE` constraint will catch it with an error rather than silent corruption, but the error isn't handled gracefully — it'll surface as an unhandled 500.

**Lines 188-190 — `created_at` overwritten on every board replace**  
`replace_board` inserts columns and cards with `created_at = now`. Every save destroys the original creation timestamps. If you ever want audit history or "created vs. modified" semantics, this makes it impossible.

---

## Frontend

### `AuthGate.tsx`

**Lines 89-116 — No debounce on board saves**  
`handleBoardChange` fires a `PUT /api/board` request on every state change passed up from `KanbanBoard` — which includes every drag event. Dragging a card slowly across the board will fire a rapid sequence of PUT requests. The `saveCounterRef` trick correctly discards stale responses, but it doesn't reduce the number of requests sent. A debounce of ~500ms would be appropriate here.

### `KanbanBoard.tsx`

**Line 7 — Unused import: `closestCorners`**  
`closestCorners` is imported from `@dnd-kit/core` but never called in the custom `collisionDetection` function. Dead import.

**Line 56 — Pointless `useMemo`**  
`const cardsById = useMemo(() => board.cards, [board.cards])` memoizes a direct property access. There is no computation here; `useMemo` has overhead and provides no benefit. Just use `board.cards` directly.

**Lines 64-68 — `initialBoard` effect triggers unnecessary full re-renders**  
When `ChatSidebar` gets an AI board update, `AuthGate` calls `setInitialBoard(nextBoard)`, which causes `KanbanBoard`'s effect to call `setBoard(initialBoard)`. This replaces the entire board state from the parent, which is fine — but it means any local uncommitted drag state would be discarded if an AI response arrived mid-drag.

### `ChatSidebar.tsx`

**Lines 27, 65 — `lastUpdateApplied` is sticky**  
"Board updated from last response" remains visible until a subsequent response explicitly returns `boardUpdatesApplied: false`. It never auto-clears. A user who gets one board update will see this message forever until they send another message.

**No scroll-to-bottom**  
As messages accumulate, the chat area does not scroll to the latest message. The user has to scroll manually after every response.

**Line 29 — Another pointless `useMemo`**  
`const isEmpty = useMemo(() => messages.length === 0, [messages.length])` is an array length comparison. Not worth memoizing.

---

## Architecture

**Whole-board replace on every save**  
`PUT /api/board` replaces the entire board on every interaction. For an 8-card board this is fine. If the board grows, this becomes expensive and creates a last-write-wins conflict if two browser tabs are open simultaneously.

**SQLite under concurrent write load**  
SQLite serializes writes, so two simultaneous `PUT /api/board` requests from the same user will queue rather than corrupt data — but they'll also block each other. Acceptable for an MVP with one user; not for anything beyond that.

**Frontend `initialData` in `kanban.ts` as fallback**  
`KanbanBoard` falls back to the hardcoded `initialData` if no `initialBoard` is passed. In practice this never shows because `AuthGate` always loads the board before rendering `KanbanBoard`, but if that logic ever changes, users will silently see stale seed data instead of an error.

---

## What's Actually Good

- The `_validate_board_integrity` check before saving AI-suggested board updates is the right call — the AI will hallucinate card IDs and this catches it.
- `_strip_code_fences` and `_parse_structured_assistant_response` are good defensive handling for LLM output that doesn't follow instructions.
- Backend tests use `tmp_path` for DB isolation — clean and correct.
- The `saveCounterRef` pattern for ignoring stale save responses is a nice touch.
- Error rollback in `ChatSidebar.handleSend` (restoring the user message and prompt on failure) is solid UX.
- Cascading deletes in the DB schema are set up correctly (even if the code doesn't always trust them).

---

## Priority Summary

| Severity | Issue |
|----------|-------|
| High | Client-side credentials / no real auth |
| High | Synchronous `requests` blocking async event loop |
| Medium | No debounce on board saves |
| Medium | Orphaned card validation missing |
| Medium | `created_at` overwritten on every replace |
| Low | Dead import (`closestCorners`) |
| Low | Pointless `useMemo` calls (×2) |
| Low | `lastUpdateApplied` never auto-clears |
| Low | No scroll-to-bottom in chat |
| Low | `ChatRequest` dual-field prompt/message |
