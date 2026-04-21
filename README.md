# PinterestAutomation

Agentic workflow automation for Carmen's Pinterest blog business.

Keyword research → WordPress draft → Ideogram images → Canva pins → Pinterest schedule, with human approval gates in a web Cockpit that Carmen uses from her Mac.

## Architecture

```
carmen-web (Next.js 15, Clerk)       ──►  Vercel
    │
    │  authenticated REST
    ▼
pinterest-svc (Fastify, TS)          ──►  Railway
    │        │
    │        ├─►  Postgres (queue + state)
    │        ├─►  n8n (visual workflow runner)
    │        ├─►  Langfuse (LLM tracing)
    │        ├─►  Sentry (errors)
    │        └─►  Discord (alerts + mobile approvals)
    │
    ├─►  Pinterest API v5, WordPress REST, Claude, Ideogram, Canva Connect
    └─►  Cloudflare R2 (image blobs)
```

See the full plan at `C:\Users\grosa\.claude\plans\i-want-to-build-snazzy-dragonfly.md`.

## Monorepo layout

```
apps/
  pinterest-svc/    Fastify backend — routes, scheduler, clients
  carmen-web/       Next.js 15 Cockpit — approvals, calendar, analytics
packages/
  shared-types/     Zod schemas shared between apps
prompts/            Claude prompt seed files
n8n-workflows/      Exported n8n workflow JSON
e2e/                Playwright tests (deferred)
```

## Prerequisites

- Node.js ≥ 20.10
- pnpm ≥ 9 (`corepack enable` then `corepack prepare pnpm@9.15.0 --activate`)
- Docker Desktop (for local Postgres + n8n + Langfuse)

## First-time setup

```bash
pnpm install
cp .env.example .env    # fill in real values
pnpm up                 # docker compose up -d
pnpm --filter @pa/shared-types build
```

## Daily workflow

```bash
pnpm dev                # runs pinterest-svc + carmen-web in parallel
pnpm test               # all workspace tests
pnpm typecheck          # all workspaces
pnpm logs               # docker compose logs -f
pnpm down               # stop containers
```

- Backend: http://localhost:3001 (health at `/health`)
- Frontend: http://localhost:3000
- n8n UI: http://localhost:5678 (creds in `.env`)
- Langfuse: http://localhost:3100

## Environment variables

See `.env.example` for the full inventory. Notable feature flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `SCHEDULER_AUTO_POST` | `false` | Scheduler posts to Pinterest without manual confirm |
| `HUMANIZE_ENABLED` | `false` | Route Claude drafts through Undetectable.ai (ToS risk; opt-in) |
| `STRIP_EXIF` | `false` | Remove EXIF from Ideogram images before upload |
| `MONTHLY_IDEOGRAM_SPEND_CAP_USD` | `60` | Hard stop on image generation spend |

## Deployment

- **Backend**: Railway — reads `railway.json`, provisions Postgres, uses `apps/pinterest-svc/Dockerfile`
- **Frontend**: Vercel — project root `apps/carmen-web`, env vars mirrored from Railway

## Project phases

- **Phase 0 — Scaffolding** (in progress): monorepo, env template, docker stack, health route, CI
- **Phase 1** — Keyword research + Claude draft + Cockpit approval UIs
- **Phase 2** — Ideogram variants + Canva autofill + EXIF/humanize gates
- **Phase 3** — Pinterest scheduler (Postgres queue + cron), analytics ingest, Discord alerts
- **Phase 4** — End-to-end Playwright + prod cutover

## Conventions

- TypeScript strict; Zod at every external boundary
- Secrets never committed; `.env` is gitignored
- One Drizzle migration per feature; no ad-hoc SQL in prod
- LLM calls traced via Langfuse; errors to Sentry
