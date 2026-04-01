# Database approach

## Goals
- Persist one Kanban board per signed-in user in SQLite.
- Keep ordering deterministic for columns and cards.
- Allow future expansion to multiple users and boards.

## Storage model
- Each user owns exactly one board in the MVP.
- Columns belong to a board and are ordered by `order_index`.
- Cards belong to a column and are ordered by `order_index`.
- Deletes cascade from users -> boards -> columns -> cards.

## Schema
The proposed schema is stored in docs/db-schema.json.

## Identifier strategy
- Use text IDs (UUID or similar) for all entities.
- Keep IDs stable across client refreshes.

## Timestamp strategy
- Store timestamps as ISO-8601 UTC strings.
- Update `updated_at` on any edit, move, or reorder.

## Initial data
- On first login, create the user record and the single board.
- Seed default columns and cards from the current frontend `initialData`.

## Ordering rules
- Columns are sorted by `order_index` within a board.
- Cards are sorted by `order_index` within a column.
- Moves update `order_index` for affected siblings.
