# react-render-board

[![npm version](https://img.shields.io/npm/v/react-render-board.svg)](https://www.npmjs.com/package/react-render-board)
[![license](https://img.shields.io/npm/l/react-render-board.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-18%20%7C%2019-61dafb.svg)](https://react.dev)

English | **[한국어](README.ko.md)**

> A **dev-only** tool that visualizes your React app's **live render tree** as a box-and-line diagram on a Figma-like board.

Instead of React DevTools' indented list view, it shows your running component structure as a **spatially arranged node diagram**. The goal: someone landing in a new codebase can grasp the whole structure at a glance.

```bash
npm install --save-dev react-render-board   # postinstall detects your bundler and wires everything up
npm run dev                                   # a board button appears at the bottom-right of your app
```

> **pnpm users need one extra step** — pnpm blocks install scripts by default, so the auto-setup above won't run. See the [pnpm section](#pnpm).

---

## Table of contents

- [How it's different](#how-its-different)
- [Features](#features)
- [Installation](#installation)
  - [npm / yarn](#npm--yarn)
  - [pnpm](#pnpm)
  - [Manual setup](#manual-setup-init)
- [Per-bundler setup](#per-bundler-setup)
- [How it works](#how-it-works)
- [Programmatic API](#programmatic-api-custom-integration)
- [Compatibility](#compatibility)
- [Requirements & limitations](#requirements--limitations)
- [Project status](#project-status)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [Development](#development-in-this-repo)
- [License](#license)

---

## How it's different

| Tool | Approach | Limitation |
|---|---|---|
| **React DevTools** | Live tree as a text list | Powerful, but the "big picture" doesn't come through intuitively |
| **CodeSee / static analysis** | Graphs `import` relationships | Diverges from the actual render structure (`children` props, Context, portals, …) |
| **react-render-board** | **Live** Fiber tree as a **spatial diagram** | React-only · dev-only (see [limitations](#requirements--limitations)) |

Several teams have tried the "live render tree + Figma-style canvas" combination (React-Sight, Realize, Reactron, …) — all unmaintained today. The niche is currently empty. Background research: [`docs/research/prior-art.md`](docs/research/prior-art.md) (Korean).

**Target user**: not the veteran who debugs daily, but **someone entering a new codebase** — onboarding, code review, architecture documentation, teaching new hires.

<!--
Demo placeholder — put screenshots/GIFs here:
![Board overview](docs/assets/overview.gif)
-->

---

## Features

### Structure visualization
- **Live render tree** — reads the Fiber tree on every React commit; when your app re-renders, the board follows.
- **Domain group frames** — components are clustered by source file path into color-coded frames. A **"group by folder"** toggle nests file groups under their parent folder (folder › file › component).
- **Semantic zoom** — zoom out for map mode (domain overview), zoom in for detail mode (individual components). A "detail in map" toggle keeps on-screen group internals visible even when zoomed out.
- **Tidy-tree layout** — symmetric tree placement with each parent centered above its children's span. Left→right is render order, top→bottom is depth.
- **List coalescing** — 5+ same-kind siblings under one parent collapse into a single representative + "×N" badge, keeping the structure stable.
- **Host nodes hidden by default** — it's a "component board", not a DOM viewer (toggleable).

### Board ↔ live DOM two-way interaction
- **Node → screen**: click a board node to highlight the matching DOM element. **Double-click** to scroll it into view.
- **Screen → node**: `Alt`(⌥)+click in your app, or click with "pick element" mode on, to jump to and highlight the matching board node. (Normal clicks are never intercepted — your app stays fully usable.)
- **Hover preview** — in pick mode, the element under the cursor is highlighted live ("this is what you'd select").

### Search & filtering
- **Search highlight + auto-navigate** — searching by component/domain name highlights matches, dims the rest, and moves the camera. Matches inside collapsed groups force them open.
- **Group + individual filter** — "show matches only" excludes non-matching groups/nodes from rendering entirely.
- **Group collapse/expand**, **right-click context menu** (groups: collapse·zoom-to / components: show on screen·search), **canvas sticky notes** (free-floating memos, persisted to localStorage).

### Data flow (experimental)
- **Props flow tracking + change afterglow** — selecting a node opens a priority-sorted props panel; clicking a prop traces its references into descendants along highlighted edges; prop changes animate flowing along parent→child edges. (Context/external-store tracking is deferred.)

### Visual language
- **Shape = role**: route entry nodes are hexagons, portals `⧉`, Suspense boundaries `⏳`, error boundaries `🛡`.
- **Hand-drawn identity** — Excalidraw-style rough.js sketch borders (static images, O(1) regardless of node count).
- **Edge decluttering** — within-group edges fade by depth; cross-group edges get orthogonal routing (frames as obstacles) plus a source→target domain color gradient; hovering a node lights up its lineage (ancestors + descendants).
- **Dark mode + per-domain palette** — a fixed 8-color palette (hashed from group names) applied consistently to frames, nodes, and the minimap.

### Shell
- **Docked panel** — bottom (default), left, or right sidebar, with drag-resize (persisted to localStorage). **Overlay-only** — it never touches the host app's layout or CSS.
- **High-frequency stability** — store updates are throttled to ~30Hz and unchanged nodes keep their references, suppressing flicker even in 60–240Hz apps.

---

## Installation

**This is a dev-only tool** — it is never injected into production builds (multiple guards, see [dev-only guards](#dev-only-guards)).

### npm / yarn

```bash
npm install --save-dev react-render-board
npm run dev
```

Right after install, a `postinstall` hook detects your bundler and wires the config **automatically**. Just run `npm run dev` and a board button appears at the bottom-right of your app.

The auto-setup only touches config files (never your app source), only runs when react-render-board is a **direct** dependency of your project, and backs up any pre-existing file it can't restore via git to `<file>.rrb-bak` before editing. To skip it entirely, set `RRB_SKIP_POSTINSTALL=1` and run [`npx react-render-board init`](#manual-setup-init) yourself when ready.

### pnpm

pnpm blocks install scripts from unknown packages by default (a supply-chain security policy — the same standard step applies to most well-known packages with install scripts, such as `esbuild` and `sharp`; it's not specific to this package). Approve once:

```bash
pnpm install --save-dev react-render-board
pnpm approve-builds --all   # non-interactive bulk approval; use `pnpm approve-builds` to pick
npm run dev
```

> ⚠️ **Don't chain with `&&`.** When ignored-builds trip, `pnpm install` returns **exit code 1** (the package itself installs fine), so anything after `&&` is silently skipped. Run the lines separately (or join with `;`).

### Manual setup (`init`)

If auto-setup was skipped or you want to re-check:

```bash
npx react-render-board init
```

`init` (automatic or manual) detects your bundler and configures it. After that, click the button at the bottom-right of your running app to open a docked panel with the live render tree. **It never touches your app's source code** (config files only) and never ships to production.

---

## Per-bundler setup

`init` does this for you — reference this section if you want to know what it does, or prefer to wire it manually.

| Bundler | What `init` does | Manual setup |
|---|---|---|
| **Vite** | Adds a plugin to `plugins` in `vite.config` | ① below |
| **Next.js / Turbopack** | Adds an early `<head>` script + `RenderBoardClient` wiring to the root `layout.tsx` | ② below |
| **webpack** | Wraps `webpack.config` with `withRenderBoard(...)` | ③ below |

**① Vite**

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rrbInjectPlugin } from 'react-render-board/vite';

export default defineConfig({
  plugins: [react(), rrbInjectPlugin()],   // active in dev (serve) only
});
```

**② Next.js / Turbopack** — Turbopack has no plugin API, so an early `<script>` goes into the root `layout.tsx` `<head>` (buffering commits from the very first one) and a client component is wired into `<body>`. `npx react-render-board init` handles this wiring and generates `RenderBoardClient.tsx` automatically (manual editing not recommended).
>
> **`layout.tsx` is modified directly, so it shows up in `git status`.** To remove the tool, run `git checkout -- app/layout.tsx` (or strip just the rrb block from the diff). Committing the change is safe — the script is wrapped in a `NODE_ENV !== 'production'` guard and is excluded from production builds.

**③ webpack**

```js
// webpack.config.js
const { withRenderBoard } = require('react-render-board/webpack');

module.exports = withRenderBoard({ /* your existing config */ });
```

> Since `0.2.2`, the runtime injects the board's styles itself — no CSS setup needed for any bundler (no css-loader required). If older instructions had you add `import 'react-render-board/style.css'` to your app entry, you can remove it (harmless if left).

---

## How it works

It does **not** parse your source code (`.jsx` files). Instead, it reads the Fiber tree that your **running** React app already keeps in memory, in real time — via `window.__REACT_DEVTOOLS_GLOBAL_HOOK__`, the official channel React exposes for development tools.

**Three-layer structure** (details in [`docs/architecture.md`](docs/architecture.md)):

```
① Hooking        access the Fiber tree on every commit via bippy + DOM↔Fiber two-way mapping
   ↓
② Data           Fiber → normalized RenderNode tree, source-path-based groupHint resolution
   ↓
③ Visualization  React Flow (@xyflow) group frames + nodes + orthogonal edges, semantic zoom
```

- **Hooking is not implemented in-house** — it's delegated to a proven library ([bippy](https://github.com/aidenybai/bippy)).
- Verified against three real third-party apps (excalidraw · berry-admin · shadcn-admin) with zero console errors.

### Dev-only guards

Multiple guards prevent production leakage: the Vite plugin's `apply: 'serve'`, Next's static `process.env.NODE_ENV` exclusion, and the runtime `__RRB_DEV__` signal set by the injection layer. Nothing reaches your production bundle in any form.

---

## Programmatic API (custom integration)

For integrating directly instead of the `init`/postinstall auto-wiring. The public API exposes only each layer's entry points (internals are not re-exported).

```tsx
import { createRoot } from 'react-dom/client';
import {
  createRenderStore,
  startFiberInspector,
  createInteractionStore,
  startDomClickBridge,
  BoardOverlay,
} from 'react-render-board';
import 'react-render-board/style.css';   // when consuming as a library, import the CSS yourself

const store = createRenderStore();
const interactionStore = createInteractionStore();

startFiberInspector(store, subjectContainer);              // ① start hooking
startDomClickBridge(subjectContainer, interactionStore);   // reverse (DOM→board) interaction, optional

createRoot(overlayHost).render(
  <BoardOverlay store={store} interactionStore={interactionStore} />
);
```

Main exports:

| Symbol | Layer | Role |
|---|---|---|
| `createRenderStore` | Data | Subscribable render-tree store |
| `startFiberInspector` | Hooking | Reads Fibers on every commit into the store |
| `startDomClickBridge`, `findFiberIdForElement`, `resolveHostElements` | Hooking | DOM↔Fiber mapping (reverse interaction) |
| `Canvas`, `BoardOverlay`, `DomHighlightOverlay` | Visualization | Board UI components |
| `createInteractionStore` | Visualization | Node↔DOM interaction state |
| `createAfterglowStore`, `readFiberProps`, `trackReferenceInDescendants`, … | Visualization | Props flow / change afterglow (optional) |

Types are exported too: `RenderNode`, `RenderSnapshot`, `FiberKind`, `RenderStore`, `InteractionStore`, `PropRow`, and more. Full list in [`src/index.ts`](src/index.ts).

---

## Compatibility

Covers the following React patterns **without any schema changes** (verified against real apps):

- Function / class components, error boundaries
- Concurrent features: `useTransition`, `use()` + Suspense
- `React.lazy` code-splitting boundaries
- Portals (placed correctly under their logical parent)
- `memo` / `forwardRef` (accurate names)

Supports **React 18 · 19** (peerDependencies `^18 || ^19`).

---

## Requirements & limitations

- **React only.** The entire stack is tied to React Fiber internals (a structural constraint, not an early-stage choice). Vue/Svelte would each need a separate implementation.
- **Dev only.** `getSource`-based grouping works only in development builds, and nothing is injected into production.
- **Scale.** Small-to-medium apps (hundreds of nodes) are solid. Large apps (thousands to 9,000+ nodes) stay responsive thanks to viewport-based partial rendering, but map-mode label overlap (declutter) with very many groups is only partially mitigated.
- **High-frequency updates.** The practical ceiling is the ~30Hz throttle cap (60–240Hz apps work, but updates are throttled).
- Node.js ≥ 18.
- Runtime dependencies: `@xyflow/react`, `bippy`, `roughjs`.

---

## Project status

🚀 **Published on npm (MIT).** Engine complete (hooking → data → visualization) + one-command `install`→canvas verified on three bundlers (Vite/Turbopack/webpack). 340+ vitest unit tests.

- [x] Tech & UI validation, live MVP, real third-party app verification (excalidraw / berry-admin / shadcn-admin)
- [x] All 5 identified defects (P0–P4) resolved + test coverage + package prep
- [x] Install experience: postinstall auto-setup, one command across three bundlers
- [x] Direction settled: stay open source, real-user feedback first (ADR-0074)
- [ ] Growing real-world usage + collecting feedback (in progress — issues welcome!)

For the full picture see [`docs/project-status.md`](docs/project-status.md) (Korean) — a living snapshot of every investigation, experiment, and decision, linked to individual [ADRs](docs/decisions/).

---

## Contributing

Bug reports are the most valuable contribution — every critical defect in this tool was caught by real-world reports. When [opening an issue](https://github.com/yoonjaehong26/react-render-board/issues/new/choose), please fill in the environment fields (bundler/framework, package manager, React version, browser extensions) — most bugs here come from environment combinations.

Before contributing code, read [`docs/architecture.md`](docs/architecture.md) — the code map (layer guide, invariants, verification checklist). Pre-PR check: `npm run typecheck && npm run test`, and bug fixes should come with a reproducing fixture or `verify:*` script.

> Most in-repo docs (ADRs, research notes) are in Korean — they're well-structured markdown, so machine translation works well. English issues and PRs are absolutely welcome.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/project-status.md`](docs/project-status.md) | **Status overview** — verification results, known defects, direction (start here) |
| [`docs/vision.md`](docs/vision.md) | The problem and goals |
| [`docs/architecture.md`](docs/architecture.md) | Code map — 3-layer structure, invariants, how to verify |
| [`docs/ui-philosophy.md`](docs/ui-philosophy.md) | UI philosophy and references |
| [`docs/roadmap.md`](docs/roadmap.md) | Staged plan |
| [`docs/research/`](docs/research/) | Background research (prior art, technical options) |
| [`docs/decisions/`](docs/decisions/) | Architecture Decision Records (ADRs) |

Docs are primarily in Korean; the [Korean README](README.ko.md) mirrors this one.

---

## Development (in this repo)

```bash
npm run dev          # live MVP (left: instrumented demo app, right: live board)
npm run build        # typecheck + build
npm run typecheck    # typecheck only (tsc -b) — run once before committing
npm run build:lib    # library build (src/index.ts public API → dist-lib/)
npm run lint         # oxlint
npm run test         # per-layer unit tests (vitest)
npm run verify       # fixture regression check (Playwright; dev server must be running)
```

> `npm run test` (vitest) strips types and won't catch type errors. **Run `npm run typecheck` once before committing.**

---

## License

[MIT](LICENSE) © yoonjaehong26
