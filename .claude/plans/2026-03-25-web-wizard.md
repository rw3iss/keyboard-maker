# Web Wizard — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Preact-based web application that mirrors the CLI wizard functionality, adds visual layout editing, real-time build monitoring, and project management — backed by a Fastify API server that wraps all existing toolchain operations.

**Architecture:** Preact SPA (TypeScript, Vite) + Fastify backend (TypeScript) with SSE for build streaming. Shares the existing `src/tools/src/` generator modules. The backend is a thin API layer over the existing toolchain; the frontend is a full application shell with menus, modals, tabs, and interactive editors.

**Tech Stack:**
- Frontend: Preact + Preact Router + TypeScript + Vite + Three.js (layout editor)
- Backend: Fastify + TypeScript + SSE (Server-Sent Events)
- Shared: Existing generator modules from `src/tools/src/`
- State: LocalStorage for UI prefs, backend filesystem for project data

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [File Structure](#file-structure)
- [Phase 1 — Backend API Server](#phase-1--backend-api-server)
- [Phase 2 — Application Shell & Core UI](#phase-2--application-shell--core-ui)
- [Phase 3 — Project Management & Config Wizard](#phase-3--project-management--config-wizard)
- [Phase 4 — Layout Editor](#phase-4--layout-editor)
- [Phase 5 — Build System & Output Viewer](#phase-5--build-system--output-viewer)
- [Phase 6 — Parts Catalog & Detail Pages](#phase-6--parts-catalog--detail-pages)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Preact SPA)                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Overview  │ │  Config  │ │  Build   │ │  Layout    │ │
│  │   Tab     │ │   Tab    │ │   Tab    │ │  Editor    │ │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘ └─────┬──────┘ │
│        │             │            │             │        │
│  ┌─────┴─────────────┴────────────┴─────────────┴─────┐  │
│  │  Services Layer (API client, state, localStorage)   │  │
│  └─────────────────────┬───────────────────────────────┘  │
└────────────────────────┼──────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────┼──────────────────────────────────┐
│  Fastify Backend       │                                   │
│  ┌─────────────────────┴───────────────────────────────┐  │
│  │  API Routes                                          │  │
│  │  /api/projects     — list, create, open, save        │  │
│  │  /api/config       — get/set build config            │  │
│  │  /api/components   — browse component database       │  │
│  │  /api/generate     — run build pipeline (SSE)        │  │
│  │  /api/build        — scan build output files         │  │
│  │  /api/preview      — render PCB preview              │  │
│  │  /api/validate     — validate config + DRC           │  │
│  └─────────────────────┬───────────────────────────────┘  │
│  ┌─────────────────────┴───────────────────────────────┐  │
│  │  Execution Engine                                    │  │
│  │  Wraps: generators, routing, KiCad CLI, Freerouting  │  │
│  │  SSE event stream: stage started/completed/errored   │  │
│  │  Error codes per operation for client diagnostics    │  │
│  └─────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Shared Modules (imported from src/tools/src/)       │  │
│  │  kle-parser, matrix-gen, kicad-gen, plate-gen,       │  │
│  │  case-gen, firmware-gen, bom-gen, routing, preview    │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **SOLID** — Single-responsibility services, interface-driven contracts, dependency injection via context
2. **Modular** — Each wizard step is a self-contained component; each backend operation is an independent service
3. **Composable** — Shared UI components (Modal, Card, Toast, Dropdown) used everywhere
4. **Config-driven** — All settings in static JSON or env vars; no hardcoded strings in components
5. **Offline-first** — LocalStorage caches UI state, backend syncs to filesystem

### Data Flow

```
User action → Component → Service → API call → Backend handler
  → Executes generator module → Streams SSE events
  → Frontend updates reactive state → UI re-renders
```

### State Management

- **ProjectState** — current project config, loaded from backend, synced on save
- **UIState** — active tab, selected step, modal stack, toasts — persisted to localStorage
- **BuildState** — generation progress, stage statuses — from SSE stream
- **ComponentDB** — cached component catalog from `/api/components`

---

## File Structure

```
src/wizard/                          # Web wizard application root
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html                       # SPA entry point
├── .env                             # Runtime config (API URL, etc.)
│
├── src/
│   ├── main.tsx                     # Preact mount + router setup
│   ├── App.tsx                      # Application shell (menu, tabs, status bar)
│   │
│   ├── config/
│   │   ├── app.config.ts            # Static app configuration
│   │   ├── routes.ts                # Route definitions
│   │   ├── wizard-steps.ts          # Step definitions (id, label, required, component)
│   │   └── error-codes.ts           # Client error code map
│   │
│   ├── services/
│   │   ├── api.service.ts           # HTTP client (fetch wrapper, error handling)
│   │   ├── sse.service.ts           # SSE client (EventSource wrapper, reconnect)
│   │   ├── project.service.ts       # Project CRUD operations
│   │   ├── config.service.ts        # Build config get/set/validate
│   │   ├── build.service.ts         # Build execution + SSE monitoring
│   │   ├── components.service.ts    # Component database queries
│   │   ├── storage.service.ts       # LocalStorage abstraction
│   │   └── toast.service.ts         # Toast notification manager
│   │
│   ├── state/
│   │   ├── app.state.ts             # Global app state (signals/context)
│   │   ├── project.state.ts         # Current project reactive state
│   │   └── build.state.ts           # Build progress reactive state
│   │
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppMenu.tsx          # Top menu bar (File, Edit, Help)
│   │   │   ├── ProjectTabs.tsx      # Overview | Config | Build tabs
│   │   │   ├── StatusBar.tsx        # Bottom status bar
│   │   │   └── ToastContainer.tsx   # Toast notification overlay
│   │   │
│   │   ├── common/
│   │   │   ├── Modal.tsx            # Generic modal (title, body, actions)
│   │   │   ├── Card.tsx             # Content card with optional image
│   │   │   ├── Dropdown.tsx         # Select dropdown
│   │   │   ├── Button.tsx           # Styled button variants
│   │   │   ├── Spinner.tsx          # Loading spinner
│   │   │   ├── Badge.tsx            # Status badge (complete, error, pending)
│   │   │   ├── Collapsible.tsx      # Collapsible section
│   │   │   ├── FileLink.tsx         # Clickable file with size/type info
│   │   │   └── Icon.tsx             # Icon component (unicode or SVG)
│   │   │
│   │   └── wizard/
│   │       ├── StepCard.tsx         # Overview card for a wizard step
│   │       ├── OptionCard.tsx       # Selectable option card (switch, MCU, etc.)
│   │       ├── ProductDetail.tsx    # Full product detail page
│   │       └── StageStatus.tsx      # Build stage status indicator
│   │
│   ├── views/
│   │   ├── Overview.tsx             # Project overview / home (all steps, status)
│   │   ├── Config.tsx               # Configuration step editor
│   │   ├── Build.tsx                # Build execution + output viewer
│   │   ├── Layout.tsx               # Visual layout editor (Three.js / 2D)
│   │   ├── PartDetail.tsx           # /parts/:category/:id detail page
│   │   ├── NewProject.tsx           # New project dialog
│   │   ├── OpenProject.tsx          # Open project dialog
│   │   └── About.tsx                # About modal content
│   │
│   ├── editors/
│   │   ├── LayoutEditor.tsx         # 2D/3D component position editor
│   │   ├── LayoutCanvas.ts          # Canvas rendering logic (Three.js or 2D)
│   │   ├── DraggableComponent.ts    # Draggable switch/screw/connector
│   │   └── LayoutState.ts           # Layout editor state management
│   │
│   ├── hooks/
│   │   ├── useProject.ts            # Project state hook
│   │   ├── useBuild.ts              # Build progress hook
│   │   ├── useModal.ts              # Modal open/close hook
│   │   ├── useToast.ts              # Toast notification hook
│   │   └── useLocalStorage.ts       # LocalStorage reactive hook
│   │
│   ├── types/
│   │   ├── project.types.ts         # Project, BuildConfig (mirrors shared/types.ts)
│   │   ├── api.types.ts             # API request/response types
│   │   ├── ui.types.ts              # UI state types
│   │   └── events.types.ts          # SSE event types
│   │
│   └── styles/
│       ├── global.css               # CSS reset, variables, dark theme
│       ├── shell.css                # App shell layout
│       ├── components.css           # Shared component styles
│       └── views.css                # View-specific styles
│
└── server/
    ├── index.ts                     # Fastify server entry point
    ├── config.ts                    # Server configuration
    │
    ├── routes/
    │   ├── projects.routes.ts       # /api/projects — CRUD
    │   ├── config.routes.ts         # /api/config — get/set/validate
    │   ├── components.routes.ts     # /api/components — browse database
    │   ├── generate.routes.ts       # /api/generate — SSE build stream
    │   ├── build.routes.ts          # /api/build — scan output files
    │   ├── preview.routes.ts        # /api/preview — render PCB
    │   ├── files.routes.ts          # /api/files — serve build artifacts
    │   └── parts.routes.ts          # /api/parts — part detail data
    │
    ├── services/
    │   ├── project.service.ts       # Filesystem project operations
    │   ├── generator.service.ts     # Wraps all generator modules
    │   ├── execution-engine.ts      # Build pipeline orchestrator with SSE
    │   ├── component-db.service.ts  # Reads data/ component JSON files
    │   ├── file-scanner.service.ts  # Scans build directories
    │   └── preview.service.ts       # Wraps kicad-cli for previews
    │
    ├── middleware/
    │   ├── error-handler.ts         # Global error handler with codes
    │   ├── cors.ts                  # CORS config
    │   └── logger.ts                # Request/response logging
    │
    └── types/
        ├── errors.ts                # Custom error classes with codes
        └── events.ts                # SSE event type definitions
```

---

## Phase 1 — Backend API Server

### Task 1: Server Scaffolding

**Files:**
- Create: `src/wizard/server/index.ts`
- Create: `src/wizard/server/config.ts`
- Create: `src/wizard/server/middleware/error-handler.ts`
- Create: `src/wizard/server/middleware/cors.ts`
- Create: `src/wizard/server/middleware/logger.ts`
- Create: `src/wizard/server/types/errors.ts`
- Create: `src/wizard/server/types/events.ts`
- Create: `src/wizard/package.json`
- Create: `src/wizard/tsconfig.json`

- [ ] **Step 1: Initialize project**

`package.json`:
```json
{
  "name": "@keyboard-maker/wizard",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "build": "vite build && tsc -p tsconfig.server.json",
    "start": "tsx server/index.ts"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install preact preact-router @preact/signals fastify @fastify/static @fastify/cors tsx vite @preact/preset-vite typescript concurrently three
npm install -D @types/three @types/node
```

- [ ] **Step 3: Create custom error classes**

`server/types/errors.ts`:
```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Error codes — each operation has a unique prefix
export const ErrorCodes = {
  // Project operations (1xxx)
  PROJECT_NOT_FOUND: 'E1001',
  PROJECT_NO_CONFIG: 'E1002',
  PROJECT_SAVE_FAILED: 'E1003',
  PROJECT_INVALID_NAME: 'E1004',
  // Config operations (2xxx)
  CONFIG_VALIDATION_FAILED: 'E2001',
  CONFIG_MISSING_FIELD: 'E2002',
  CONFIG_INVALID_VALUE: 'E2003',
  // Build operations (3xxx)
  BUILD_ALREADY_RUNNING: 'E3001',
  BUILD_LAYOUT_PARSE_FAILED: 'E3002',
  BUILD_MATRIX_FAILED: 'E3003',
  BUILD_SCHEMATIC_FAILED: 'E3004',
  BUILD_PCB_FAILED: 'E3005',
  BUILD_ROUTING_FAILED: 'E3006',
  BUILD_PLATE_FAILED: 'E3007',
  BUILD_CASE_FAILED: 'E3008',
  BUILD_FIRMWARE_FAILED: 'E3009',
  BUILD_BOM_FAILED: 'E3010',
  BUILD_GERBER_FAILED: 'E3011',
  BUILD_OVERVIEW_FAILED: 'E3012',
  // Component operations (4xxx)
  COMPONENT_NOT_FOUND: 'E4001',
  COMPONENT_CATEGORY_INVALID: 'E4002',
  // File operations (5xxx)
  FILE_NOT_FOUND: 'E5001',
  FILE_READ_FAILED: 'E5002',
} as const;
```

- [ ] **Step 4: Create SSE event types**

`server/types/events.ts`:
```typescript
export interface BuildEvent {
  type: 'stage:start' | 'stage:complete' | 'stage:error' | 'build:complete' | 'build:error' | 'log';
  stage?: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

export type BuildStage =
  | 'layout' | 'matrix' | 'schematic' | 'pcb' | 'routing'
  | 'gerbers' | 'plate' | 'case' | 'firmware' | 'bom' | 'overview';
```

- [ ] **Step 5: Create Fastify server with middleware**

Server serves the Vite-built SPA in production, proxies in dev.
CORS allows localhost:5173 (Vite dev server).
Global error handler catches `AppError` and returns structured JSON:
```json
{ "error": true, "code": "E3005", "message": "PCB generation failed", "details": {...} }
```

- [ ] **Step 6: Commit**

---

### Task 2: Project Routes

**Files:**
- Create: `src/wizard/server/routes/projects.routes.ts`
- Create: `src/wizard/server/services/project.service.ts`

Endpoints:
- `GET /api/projects` — list all project folders in `projects/` with status (has config, has build)
- `GET /api/projects/:name` — get project details (config, build files, metadata)
- `POST /api/projects` — create new project folder + empty config
- `PUT /api/projects/:name/config` — save build-config.json
- `DELETE /api/projects/:name` — delete project (with confirmation token)

The service reads/writes to the filesystem under the project root's `projects/` directory.

- [ ] **Step 1: Implement project service**
- [ ] **Step 2: Implement routes with validation**
- [ ] **Step 3: Test endpoints with curl**
- [ ] **Step 4: Commit**

---

### Task 3: Component Database Routes

**Files:**
- Create: `src/wizard/server/routes/components.routes.ts`
- Create: `src/wizard/server/services/component-db.service.ts`

Endpoints:
- `GET /api/components` — list all categories
- `GET /api/components/:category` — list components in a category
- `GET /api/components/:category/:id` — get full component detail (for product pages)
- `GET /api/parts/:category/:id` — alias for public part detail pages

The service wraps the existing `data-loader.ts` module.

- [ ] **Step 1: Implement component DB service**
- [ ] **Step 2: Implement routes**
- [ ] **Step 3: Commit**

---

### Task 4: Config Validation Routes

**Files:**
- Create: `src/wizard/server/routes/config.routes.ts`
- Create: `src/wizard/server/services/generator.service.ts`

Endpoints:
- `POST /api/config/validate` — validate a build config, return errors + design concerns
- `POST /api/config/preview-matrix` — parse layout + generate matrix (for layout preview)

- [ ] **Step 1: Implement generator service wrapper**
- [ ] **Step 2: Implement routes**
- [ ] **Step 3: Commit**

---

### Task 5: Build Execution Engine (SSE)

**Files:**
- Create: `src/wizard/server/services/execution-engine.ts`
- Create: `src/wizard/server/routes/generate.routes.ts`

The execution engine:
1. Accepts a `BuildConfig` + output selections
2. Runs each generator stage sequentially
3. Emits SSE events for each stage: `stage:start`, `stage:complete`, `stage:error`
4. Wraps each stage in try/catch with specific error codes
5. Tracks build state (running, completed, failed)
6. Only one build can run at a time per project

SSE endpoint: `GET /api/generate/:projectName/stream`
Trigger: `POST /api/generate/:projectName` — starts the build, returns immediately with a stream ID

```typescript
// execution-engine.ts
export class ExecutionEngine {
  private activeBuilds = new Map<string, BuildState>();

  async executeBuild(
    projectName: string,
    config: BuildConfig,
    outputs: OutputSelection,
    emitter: (event: BuildEvent) => void,
  ): Promise<void> {
    if (this.activeBuilds.has(projectName)) {
      throw new AppError(409, ErrorCodes.BUILD_ALREADY_RUNNING, 'Build already in progress');
    }

    const state: BuildState = { status: 'running', stages: {} };
    this.activeBuilds.set(projectName, state);

    try {
      // Each stage wrapped independently
      if (outputs.schematic) {
        emitter({ type: 'stage:start', stage: 'schematic', message: 'Generating schematic...', timestamp: new Date().toISOString() });
        try {
          const result = generateSchematic(layout, matrix, config);
          writeFileSync(...);
          emitter({ type: 'stage:complete', stage: 'schematic', message: 'Schematic generated', timestamp: new Date().toISOString() });
        } catch (err) {
          emitter({ type: 'stage:error', stage: 'schematic', message: err.message, timestamp: new Date().toISOString() });
        }
      }
      // ... repeat for each stage
    } finally {
      this.activeBuilds.delete(projectName);
    }
  }
}
```

- [ ] **Step 1: Implement execution engine**
- [ ] **Step 2: Implement SSE route**
- [ ] **Step 3: Test with curl + SSE**
- [ ] **Step 4: Commit**

---

### Task 6: Build Output Scanner & File Server

**Files:**
- Create: `src/wizard/server/routes/build.routes.ts`
- Create: `src/wizard/server/routes/files.routes.ts`
- Create: `src/wizard/server/services/file-scanner.service.ts`

Endpoints:
- `GET /api/build/:projectName` — scan build directory, return grouped file list with metadata
- `GET /api/build/:projectName/files/*` — serve any build artifact (for inline preview)
- `GET /api/preview/:projectName` — generate/return PCB preview images

The file scanner groups files: PCB files, firmware, 3D models, images, documentation, other.
Each file entry includes: name, path, size, type, group, previewable (boolean).

- [ ] **Step 1: Implement file scanner**
- [ ] **Step 2: Implement routes**
- [ ] **Step 3: Commit**

---

## Phase 2 — Application Shell & Core UI

### Task 7: Vite + Preact Setup

**Files:**
- Create: `src/wizard/vite.config.ts`
- Create: `src/wizard/index.html`
- Create: `src/wizard/src/main.tsx`
- Create: `src/wizard/src/App.tsx`
- Create: `src/wizard/src/styles/global.css`

- [ ] **Step 1: Configure Vite with Preact plugin**
- [ ] **Step 2: Create HTML entry with dark theme**
- [ ] **Step 3: Create App shell with router**
- [ ] **Step 4: Commit**

---

### Task 8: Shared UI Components

**Files:**
- Create all files in `src/wizard/src/components/common/`

Build the component library first — everything else depends on it.

- [ ] **Step 1: Modal** — title, body slot, action buttons array, onClose, backdrop click to close, Escape to close
- [ ] **Step 2: Card** — title, description, image slot, clickable, selected state, badge
- [ ] **Step 3: Dropdown** — options array, selected value, onChange, search/filter
- [ ] **Step 4: Button** — variants (primary, secondary, danger, ghost), sizes, loading state
- [ ] **Step 5: Spinner, Badge, Icon** — utility components
- [ ] **Step 6: Collapsible** — header + expandable body, default open/closed
- [ ] **Step 7: FileLink** — file name, size, type icon, clickable
- [ ] **Step 8: ToastContainer** — fixed position, auto-dismiss, severity colors
- [ ] **Step 9: Commit**

---

### Task 9: Application Shell

**Files:**
- Create: `src/wizard/src/components/shell/AppMenu.tsx`
- Create: `src/wizard/src/components/shell/ProjectTabs.tsx`
- Create: `src/wizard/src/components/shell/StatusBar.tsx`
- Create: `src/wizard/src/components/shell/ToastContainer.tsx`
- Create: `src/wizard/src/styles/shell.css`

The shell layout:
```
┌─────────────────────────────────────┐
│  File  Edit  Help                    │  ← AppMenu
├─────────────────────────────────────┤
│  Overview │ Config │ Build           │  ← ProjectTabs (only when project open)
├─────────────────────────────────────┤
│                                      │
│         View Content Area            │  ← Router outlet
│                                      │
├─────────────────────────────────────┤
│  Project: blue-dream │ Ready         │  ← StatusBar
└─────────────────────────────────────┘
```

- [ ] **Step 1: Implement AppMenu with File menu** (New, Open, Save, Exit)
- [ ] **Step 2: Implement ProjectTabs** (Overview, Config, Build) — only shown when project loaded
- [ ] **Step 3: Implement StatusBar** — project name, build status, last action
- [ ] **Step 4: Wire up menu actions** — Open triggers OpenProject dialog, etc.
- [ ] **Step 5: Commit**

---

### Task 10: Services & State Layer

**Files:**
- Create all files in `src/wizard/src/services/`
- Create all files in `src/wizard/src/state/`
- Create all files in `src/wizard/src/hooks/`

- [ ] **Step 1: API service** — `fetchJSON(url, opts)`, automatic error parsing, base URL from env
- [ ] **Step 2: SSE service** — `connectSSE(url, handlers)`, auto-reconnect, typed events
- [ ] **Step 3: Storage service** — `get<T>(key)`, `set(key, value)`, `remove(key)`, typed wrappers
- [ ] **Step 4: Project service** — `listProjects()`, `openProject(name)`, `saveConfig(name, config)`, `createProject(name)`
- [ ] **Step 5: Build service** — `startBuild(name, outputs)`, `getBuildStatus(name)`, `getBuildFiles(name)`
- [ ] **Step 6: App state** — Preact signals: `currentProject`, `activeTab`, `modalStack`, `toasts`
- [ ] **Step 7: Custom hooks** — `useProject()`, `useBuild()`, `useModal()`, `useToast()`, `useLocalStorage()`
- [ ] **Step 8: Commit**

---

## Phase 3 — Project Management & Config Wizard

### Task 11: Open / New Project Dialogs

**Files:**
- Create: `src/wizard/src/views/OpenProject.tsx`
- Create: `src/wizard/src/views/NewProject.tsx`
- Create: `src/wizard/src/views/About.tsx`

- [ ] **Step 1: OpenProject** — fetches `/api/projects`, shows folder list with status badges, click to load
- [ ] **Step 2: Handle missing config** — if no build-config.json, show warning modal with "Start Wizard" button
- [ ] **Step 3: NewProject** — name input, creates folder via POST, opens empty project
- [ ] **Step 4: About modal** — project info, version, links
- [ ] **Step 5: Unsaved changes guard** — on Exit with dirty state, show confirm modal
- [ ] **Step 6: Commit**

---

### Task 12: Overview View

**Files:**
- Create: `src/wizard/src/views/Overview.tsx`
- Create: `src/wizard/src/components/wizard/StepCard.tsx`
- Create: `src/wizard/src/config/wizard-steps.ts`

The overview shows all wizard steps as cards in a vertical list. Each card shows:
- Step name and icon
- Current selection (or "Not configured" with error badge)
- Click to jump to Config view for that step

Wizard steps (defined in `wizard-steps.ts`):
```typescript
export const WIZARD_STEPS = [
  { id: 'layout', label: 'Layout', required: true, icon: '⌨️' },
  { id: 'switches', label: 'Switches', required: true, icon: '🔘' },
  { id: 'mcu', label: 'MCU Module', required: true, icon: '🔧' },
  { id: 'connectivity', label: 'Connectivity', required: false, icon: '📡' },
  { id: 'power', label: 'Power', required: false, icon: '🔋' },
  { id: 'features', label: 'Features', required: false, icon: '💡' },
  { id: 'pcb', label: 'PCB & Layers', required: true, icon: '📐' },
  { id: 'physical', label: 'Physical Layout', required: false, icon: '📏' },
  { id: 'outputs', label: 'Outputs', required: true, icon: '📦' },
  { id: 'layout-editor', label: 'Layout Editor', required: false, icon: '✏️' },
] as const;
```

The overview also shows:
- Project summary card at top (name, key count, MCU, switch, completion %)
- Quick-action buttons: "Start Build", "Preview PCB", "Open in KiCad"
- Build status section (if build exists): last build date, file count, any errors

- [ ] **Step 1: Define wizard steps config**
- [ ] **Step 2: Implement StepCard component**
- [ ] **Step 3: Implement Overview view with step grid**
- [ ] **Step 4: Add project summary card**
- [ ] **Step 5: Add build status section**
- [ ] **Step 6: Commit**

---

### Task 13: Config View — Step Editor

**Files:**
- Create: `src/wizard/src/views/Config.tsx`
- Create: `src/wizard/src/components/wizard/OptionCard.tsx`

The Config view has:
1. **Top bar**: Cancel button | Step dropdown | Selected option dropdown | Save button
2. **Content area**: List of option cards for the selected step

Route: `/config?step=switches&selected=kailh-choc-v2-blue`

When user selects a step in the first dropdown, the page loads the available options for that step from `/api/components/:category` and renders them as OptionCards.

OptionCard shows: name, brief description, image placeholder, key specs, "Select" button.
Clicking an OptionCard sets it as the selected option in the top bar.
Clicking Save writes the selection to the project config and returns to Overview.

For simple steps (connectivity, outputs), show toggle/checkbox controls instead of cards.

- [ ] **Step 1: Implement Config view shell with top bar**
- [ ] **Step 2: Implement OptionCard**
- [ ] **Step 3: Implement step-specific renderers** (switches, mcu, connectors use cards; connectivity uses toggles; outputs uses checkboxes)
- [ ] **Step 4: Wire Save to project config update**
- [ ] **Step 5: Add Layers custom view** — layer count selector + stackup diagram + layer assignment dropdowns
- [ ] **Step 6: Commit**

---

### Task 14: Product Detail Pages

**Files:**
- Create: `src/wizard/src/views/PartDetail.tsx`
- Create: `src/wizard/src/components/wizard/ProductDetail.tsx`

Route: `/parts/:category/:id` (e.g., `/parts/switches/kailh-choc-v2`)

These are standalone pages (accessible without an open project) that show full component details:
- Name, manufacturer, image area
- Summary, description
- Specs table (all fields from the component JSON)
- Pros/cons, design notes
- Supplier links with prices
- Dimensional rendering (if data available)
- "Use in current project" button (if project is open)

- [ ] **Step 1: Implement ProductDetail component**
- [ ] **Step 2: Implement PartDetail view with data loading**
- [ ] **Step 3: Add routing for /parts/:category/:id**
- [ ] **Step 4: Commit**

---

## Phase 4 — Layout Editor

### Task 15: Interactive Layout Editor

**Files:**
- Create: `src/wizard/src/views/Layout.tsx`
- Create: `src/wizard/src/editors/LayoutEditor.tsx`
- Create: `src/wizard/src/editors/LayoutCanvas.ts`
- Create: `src/wizard/src/editors/DraggableComponent.ts`
- Create: `src/wizard/src/editors/LayoutState.ts`

This is the "Layout Editor" step — a custom view where users can:
1. See the PCB outline with all switches positioned from the KLE layout
2. See screw holes, USB connector, power button, MCU in their configured positions
3. **Drag components to reposition them** (screws, USB, power, MCU)
4. Toggle layer visibility (switches, screws, connectors, outline)
5. Save positions back to the build config

Implementation approach: **2D Canvas** (simpler, more reliable for drag positioning)
- HTML5 Canvas with zoom/pan (mouse wheel + middle-drag)
- Components rendered as colored rectangles/circles at their mm positions
- Click to select, drag to move
- Snapping to 0.5mm grid
- Position changes update the config's `physical.screwOverrides`, `physical.usbPosition`, etc.

Add new config fields for position overrides:
```typescript
physical: {
  ...existing fields...
  /** Manual position overrides (mm, relative to board origin) */
  screwOverrides?: Array<{ label: string; x: number; y: number }>;
  usbPositionOverride?: { x: number; y: number };
  mcuPositionOverride?: { x: number; y: number };
};
```

The layout editor reads the current config + layout to compute default positions, then allows manual adjustments. When saved, overrides are written to the config.

- [ ] **Step 1: Add override fields to BuildConfig type**
- [ ] **Step 2: Implement LayoutState** — loads config, computes positions, tracks selections/drags
- [ ] **Step 3: Implement LayoutCanvas** — 2D Canvas renderer with zoom/pan, grid, component shapes
- [ ] **Step 4: Implement DraggableComponent** — hit testing, drag handling, snap-to-grid
- [ ] **Step 5: Implement LayoutEditor** — combines canvas + toolbar (layer toggles, zoom, reset)
- [ ] **Step 6: Implement Layout view** — wraps editor + top bar with Save/Cancel
- [ ] **Step 7: Wire position overrides into PCB/plate/case generators**
- [ ] **Step 8: Commit**

---

## Phase 5 — Build System & Output Viewer

### Task 16: Build View — Generation UI

**Files:**
- Create: `src/wizard/src/views/Build.tsx`
- Create: `src/wizard/src/components/wizard/StageStatus.tsx`

The Build view has two sections:

**Section 1: Generate**
- If config incomplete: show error with links to fix
- If config valid: show "Generate" button
- When clicked: expand output selection panel (checkboxes for each artifact)
- Click "Generate" → POST to backend → switch to progress view
- Progress view: list of stages with spinner/check/error icons, updated via SSE
- On complete: success message + "View Output" button

**Section 2: Build Output** (shown if build exists)
- Grouped file sections (PCB, Firmware, 3D, Documentation)
- Each section collapsible
- Files with: name, size, type badge, preview button
- Inline preview for images (SVG, PNG)
- Inline code preview for text files (.conf, .keymap, .overlay)
- "Open in viewer" button for 3D files
- Download links for all files

- [ ] **Step 1: Implement StageStatus component**
- [ ] **Step 2: Implement Build view — generate section**
- [ ] **Step 3: Wire SSE for build progress**
- [ ] **Step 4: Implement build output section**
- [ ] **Step 5: Implement inline previews**
- [ ] **Step 6: Commit**

---

## Phase 6 — Parts Catalog & Polish

### Task 17: Parts Catalog Routes

- [ ] **Step 1: Add /parts routes to Preact router**
- [ ] **Step 2: Add breadcrumb navigation**
- [ ] **Step 3: Add search/filter to parts pages**
- [ ] **Step 4: Commit**

### Task 18: Polish & Integration

- [ ] **Step 1: Keyboard shortcuts** (Ctrl+S to save, Ctrl+N new, Ctrl+O open)
- [ ] **Step 2: URL query parameters** for Config view (step, selected)
- [ ] **Step 3: Loading states** for all async operations
- [ ] **Step 4: Error boundaries** around views
- [ ] **Step 5: LocalStorage persistence** — last project, last tab, UI preferences
- [ ] **Step 6: Responsive layout** — works on smaller screens
- [ ] **Step 7: Final commit + update README**

---

## Build Order & Dependencies

```
Phase 1 (Backend)
  Task 1: Server scaffolding
  Task 2: Project routes ──────┐
  Task 3: Component routes ────┤
  Task 4: Config routes ───────┤ (parallel after Task 1)
  Task 5: Build SSE engine ────┤
  Task 6: File scanner ────────┘

Phase 2 (Frontend Shell)
  Task 7: Vite + Preact setup
  Task 8: Shared UI components ──┐
  Task 9: App shell ─────────────┤ (parallel)
  Task 10: Services + state ─────┘

Phase 3 (Wizard)
  Task 11: Open/New project (depends on Phase 1+2)
  Task 12: Overview view
  Task 13: Config view
  Task 14: Part detail pages

Phase 4 (Layout)
  Task 15: Layout editor (depends on Task 13)

Phase 5 (Build)
  Task 16: Build view (depends on Task 5 + Phase 2)

Phase 6 (Polish)
  Tasks 17-18: Final integration
```

**Parallelizable groups:**
- Tasks 2+3+4+5+6 (all backend routes, after Task 1)
- Tasks 8+9+10 (frontend shell components)
- Tasks 12+13+14 (wizard views, after Task 11)

---

## CLI Command to Start

```bash
cd src/wizard

# Development (both server + client with hot reload)
npm run dev

# Production build
npm run build
npm run start
```

The dev server runs Fastify on port 3001 and Vite on port 5173.
Vite proxies `/api/*` requests to Fastify.
In production, Fastify serves the built SPA from `dist/`.

---

## Design System

### Colors (Dark Theme)
```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-card: #1f2937;
  --bg-hover: #2d3748;
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --accent: #6ecbf5;
  --accent-hover: #93d7f7;
  --success: #22c55e;
  --warning: #eab308;
  --error: #ef4444;
  --border: #334155;
}
```

### Typography
- Headers: system-ui, -apple-system, sans-serif
- Body: same
- Code/specs: 'JetBrains Mono', 'Fira Code', monospace

### Component Sizing
- Cards: 100% width, min-height 80px
- Buttons: 32px height (sm), 40px (md), 48px (lg)
- Modal: max-width 600px, max-height 80vh
- Inputs: 40px height, 8px padding
