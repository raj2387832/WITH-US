# Workspace

## Overview

Browser-native image processing web app with three tools: Background Remover, Watermark Remover, and Image Enhancer — all 100% in-browser, no paid APIs. Includes an auth system (Replit OIDC), a credits system (2 free/day + purchasable packs via Stripe), and an admin panel.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/bg-remover) served at `/`
- **API framework**: Express 5 (artifacts/api-server) at `/api`
- **Python server**: Flask (artifacts/bg-python-server/app.py) — background removal engine
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **Auth**: Replit OIDC (openid-client) — session-based, cookie auth
- **Payments**: Stripe (one-time payment, credit packs)
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec at lib/api-spec)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/         # Express API (auth, credits, admin, bg-removal proxy)
│   ├── bg-remover/         # React + Vite frontend (BG, Watermark, Enhancer, Pricing, Admin)
│   └── bg-python-server/   # Python Flask BG removal server (port 5001)
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks + customFetch
│   ├── api-zod/            # Generated Zod schemas
│   ├── db/                 # Drizzle schema: users, creditTransactions
│   └── replit-auth-web/    # useAuth() hook for Replit OIDC in React
├── scripts/
│   ├── src/seed-products.ts  # Creates Stripe products/prices
│   └── src/stripeClient.ts   # Stripe client for scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json             # Root project references (db, api-client-react, api-zod, replit-auth-web)
└── package.json
```

## Workflows

- **artifacts/bg-remover: web** — Vite dev server for the React frontend (port 25465, path `/`)
- **artifacts/api-server: API Server** — Express server at `/api` (port 8080)
- **Python BG Server** — Flask server on port 5001

## Frontend Pages

- `/` — Background Remover (in-browser, @imgly/background-removal + ONNX)
- `/watermark` — Watermark Remover (canvas-based, OpenCV.js)
- `/enhance` — Image Enhancer (pure-JS: bilateral denoise, CLAHE-like, Lanczos upscale)
- `/pricing` — Credit packs pricing, daily free claim, Stripe checkout
- `/admin` — Admin panel (users, stats, grant/deduct credits, toggle admin) — restricted to `isAdmin=true` users

## Auth System

- Replit OIDC via `openid-client` — session stored in server-side cookie (httpOnly)
- `GET /api/login` — redirects to Replit OIDC
- `GET /api/login/callback` — exchanges code, stores session
- `GET /api/logout` — clears session
- `GET /api/auth/user` — returns `{ user: AuthUser | null }`
- `useAuth()` hook in `lib/replit-auth-web` wraps these for React

## Credits System

- Users table: `creditsBalance`, `lastDailyClaim`, `isAdmin`, `stripeCustomerId`
- `creditTransactionsTable` — audit log of every credit change (type: daily/purchase/use/admin/refund)
- `POST /api/credits/claim-daily` — gives 2 free credits if not already claimed today
- `GET /api/credits/balance` — returns current balance + canClaimDaily flag
- `POST /api/credits/checkout` — creates Stripe one-time payment checkout session
- `GET /api/credits/products` — lists Stripe products with `credits` metadata
- Stripe webhook at `POST /api/stripe/webhook` — credits added on `checkout.session.completed`

## Admin API

- `GET /api/admin/stats` — totals: users, credits in circulation, transactions, credits issued
- `GET /api/admin/users` — all users
- `GET /api/admin/transactions` — recent transactions
- `POST /api/admin/users/:id/credits` — grant or deduct credits
- `POST /api/admin/users/:id/toggle-admin` — flip isAdmin flag

## Database Schema

- `usersTable`: id (Replit userId), email, firstName, lastName, profileImageUrl, creditsBalance, lastDailyClaim, isAdmin, stripeCustomerId, createdAt, updatedAt
- `creditTransactionsTable`: id, userId, amount, type, stripePaymentIntentId, description, createdAt

## Stripe Setup

1. Connect Stripe via Replit integrations (sets `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`)
2. Run `pnpm tsx scripts/src/seed-products.ts` to create credit pack products
3. Configure Stripe webhook endpoint → `https://<domain>/api/stripe/webhook`, event: `checkout.session.completed`
4. Set `STRIPE_WEBHOOK_SECRET` environment variable

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` with `composite: true`. Root `tsconfig.json` lists all composite lib packages as project references. Run `pnpm run typecheck` from the root for cross-package type checking.

## Background Removal Algorithm (Python)

1. CLAHE contrast enhancement (LAB color space)
2. Multi-scale Canny edge detection
3. Border-based background color estimation
4. Saliency-based foreground/background seeding
5. OpenCV GrabCut (graph-cut based segmentation)
6. Connected component cleanup
7. Soft alpha feathering at edges

## Critical Notes

- Stripe webhook route must be registered BEFORE `express.json()` middleware (needs raw body)
- Worker `onerror` must only call `e.preventDefault()` — never `reject()` (Vite error overlay)
- Image Enhancer uses pure-JS worker (no CDN imports) — Replit proxy blocks `importScripts` in blob workers
- API proxy routing: all `/api` traffic goes through shared Replit proxy → api-server port 8080
- Do NOT add Vite proxy configs — the shared proxy handles cross-service routing automatically
