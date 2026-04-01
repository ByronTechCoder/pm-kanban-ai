# Backend code summary

## Overview
The backend is a FastAPI service that serves the statically exported frontend at `/` and exposes a simple JSON API endpoint. The API will later expand to handle authentication, Kanban persistence, and AI requests.

## Entry points
- `app/main.py`: FastAPI app, API route, and static file hosting.

## Static assets
- `frontend/out/`: Static export output from the Next.js build, copied into the Docker image.

## Database
- `app/db.py`: SQLite initialization, seed data handling, and board read/write helpers.
- `app/seed_data.py`: Initial board seed used when a user has no existing board.

## Tests
- `tests/test_board_api.py`: Backend API tests for board read/write behavior.

## Dependencies
- `fastapi`
- `uvicorn`