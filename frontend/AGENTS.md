# Frontend code summary

## Overview
This is a Next.js app that renders a single Kanban board at `/` using client-side state. The UI uses Tailwind CSS and CSS variables for the design system. Drag-and-drop is powered by `@dnd-kit`.

## Entry points
- `src/app/layout.tsx`: App shell, fonts, metadata, global styles.
- `src/app/page.tsx`: Renders the `KanbanBoard` component.
- `src/app/globals.css`: Tailwind import plus design tokens and base styles.

## Kanban UI
- `src/components/KanbanBoard.tsx`: Owns board state, drag-and-drop handlers, column rename, add/remove cards.
- `src/components/KanbanColumn.tsx`: Column layout, editable title, droppable area, list of cards.
- `src/components/KanbanCard.tsx`: Sortable card UI with delete action.
- `src/components/KanbanCardPreview.tsx`: Drag overlay preview card.
- `src/components/NewCardForm.tsx`: Inline add-card form per column.

## Data model and logic
- `src/lib/kanban.ts`: Board data types, initial board seed, `moveCard` logic, ID generator.

## Tests
- Unit: `src/components/KanbanBoard.test.tsx`, `src/lib/kanban.test.ts`
- E2E: `tests/kanban.spec.ts`
- Commands (from README): `npm run test:unit`, `npm run test:e2e`
