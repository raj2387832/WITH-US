# Workspace

## Overview

Background Remover web app — upload an image, get the background removed using OpenCV GrabCut + edge detection (no AI, no API). A pnpm workspace monorepo using TypeScript for the frontend and Python Flask for image processing.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/bg-remover)
- **API framework**: Express 5 (artifacts/api-server) — proxies `/api/remove-bg` to the Python server
- **Python server**: Flask (artifacts/bg-python-server/app.py) — background removal engine
- **Image processing**: OpenCV GrabCut + multi-scale Canny edge detection + CLAHE enhancement
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API server (proxies /api/remove-bg → Python)
│   ├── bg-remover/         # React + Vite frontend (served at /)
│   └── bg-python-server/   # Python Flask BG removal server (port 5001)
│       └── app.py          # Core image processing logic
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Workflows

- **artifacts/bg-remover: web** — Vite dev server for the React frontend
- **artifacts/api-server: API Server** — Express server at /api, proxies /api/remove-bg to Python
- **Python BG Server** — Flask server on port 5001, handles actual image processing

## Background Removal Algorithm

1. CLAHE contrast enhancement (LAB color space)
2. Multi-scale Canny edge detection
3. Border-based background color estimation
4. Saliency-based foreground/background seeding
5. OpenCV GrabCut (graph-cut based segmentation)
6. Connected component cleanup (noise removal)
7. Soft alpha feathering at edges

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## API

### `POST /api/remove-bg`
- **Input**: multipart/form-data with `image` (file), `threshold` (int 1-100, default 15), `iterations` (int 1-20, default 5)
- **Output**: PNG image with transparent background (RGBA)
- Proxied through Express → Python Flask

### `GET /api/healthz`
- Returns `{"status": "ok"}`
