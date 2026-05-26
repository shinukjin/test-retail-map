# AI Worklog

## 2026-05-26

### Orchestrator Setup
- Read `AGENTS.md` and confirmed local project rules.
- Checked `git status --short`.
- Checked latest commit: `38eb118 Merge branch 'main' of https://github.com/shinukjin/test-retail-map`.
- Read local Next.js 16.2.6 docs for App Router route handlers and server/client components.
- Created `.current-task.md`.

### Scope
- Initial approved scope:
  - `src/app/map-konva`
  - `src/app/map-import`
  - `src/app/api`
- Expanded scope after confirmation:
  - `src/experiments/floor-import`
  - `src/experiments/grid-editor`
  - `src/experiments/konva`
  - `src/experiments/fabric`
  - `eslint.config.mjs`

### Changes
- Fixed `src/app/map-import/page.tsx` dynamic loading JSX formatting while preserving the existing loading text.
- Fixed React Compiler/ESLint errors in floor import and grid editor hooks by avoiding render-time ref reads and synchronous effect state updates.
- Fixed a `prefer-const` lint error in clipboard utilities.
- Moved Konva model ref synchronization out of render.
- Added `public/pdf.worker.min.mjs` to ESLint global ignores because it is a minified worker artifact.
- Removed remaining lint warnings in touched experiment files.

### Verification
- `npx eslint src/app/map-import src/app/map-konva src/app/api` passed.
- `npm run lint` passed with no warnings.
- `npm run build` initially failed with `.next` EPERM during cleanup, then passed after elevated rerun.

### Konva Cell Move Review
- Reviewed the Konva grid move flow in `src/experiments/konva/GridEditorKonva.tsx`.
- Reviewed clipboard-based movement in `src/experiments/grid-editor/grid-clipboard-utils.ts`.
- Reviewed model API exposure in `src/experiments/grid-editor/useGridEditorModel.ts`.
- Checked supporting merge/selection/type/coordinate helpers:
  - `src/experiments/grid-editor/grid-inquiry-utils.ts`
  - `src/experiments/grid-editor/grid-selection-utils.ts`
  - `src/experiments/konva/grid-editor-types.ts`
  - `src/experiments/konva/grid-editor-cell-draw.ts`
- Confirmed long-press cell movement, drag preview, pointer-to-grid coordinate conversion, merged-cell anchor resolution, and model-level `moveSelectionByDelta` are present.
- `npm run lint` passed.
- `npm run build` initially failed with `.next` EPERM during cleanup, then passed after elevated rerun.

### Zone subdivision feature
- Added shared subdivide utilities: `src/lib/zone-subdivide-utils.ts`, `src/lib/shelf-subdivide.ts`.
- Added Konva grid subdivide: `src/experiments/konva/grid-subdivide.ts`, `KonvaZoneSubdividePanel.tsx`.
- Added shared UI: `src/experiments/_shared/ZoneSubdivideForm.tsx` (editable default sub-codes, suffix replication).
- Wired Konva editor: `GridEditorKonva.tsx`, `useGridEditorModel.subdivideSelectedZone`.
- Wired floor import step 3: `FloorImportSidePanel.tsx`, `useFloorImportModel.subdivideShelf`.
- Fabric editor unchanged.

### Konva editor sidebar UX
- Replaced stacked accordion + top persist bar with tabbed `KonvaEditorSidePanel` (선택 / 그리드 / 스타일 / 도면).
- Removed duplicate undo/copy mini-bar from sidebar; toolbar retains edit actions.
- Integrated cell data, merge, subdivide, style inspector, grid setup, and save/load into contextual tabs.
- Fabric `GridEditorSidePanel` unchanged.
