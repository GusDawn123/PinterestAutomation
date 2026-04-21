# PinterestAutomation

Agentic workflow automation for Carmen's Pinterest blog business.

Keyword research → WordPress draft → Ideogram images → Pinterest schedule, with human approval gates in a web Cockpit.

## Architecture

```
carmen-web (Next.js 15)              ──►  Vercel
    │
    │  REST API
    ▼
pinterest-svc (Fastify, TypeScript)  ──►  Railway
    │
    ├─►  Postgres (workflow state + pin queue)
    ├─►  Langfuse (LLM tracing)
    ├─►  Sentry (error monitoring)
    └─►  Discord (alerts)
    │
    ├─►  Pinterest API v5
    ├─►  WordPress REST
    ├─►  Anthropic (Claude) — drafts, pin copy, alt text, affiliate queries
    ├─►  Ideogram — blog image generation
    └─►  Cloudflare R2 (image storage)
```

## Monorepo layout

```
apps/
  pinterest-svc/    Fastify backend — routes, scheduler, clients, services
  carmen-web/       Next.js Cockpit — approvals, calendar, analytics
packages/
  shared-types/     Zod schemas shared between apps
prompts/            Claude prompt seed files (blog_draft, pin_copy, alt_text, etc.)
e2e/                Playwright end-to-end tests
```

## Approval workflow

```
Start workflow
    │
    ▼
[Keyword approval]    Pick keyword + write brief
    │
    ▼
[Draft approval]      Edit Claude-generated blog post
    │
    ▼
[Images approval]     Review Ideogram-generated images, regenerate if needed
    │
    ▼
[Affiliates approval] Add affiliate product HTML per image slot
    │
    ▼
[Pins approval]       Pick copy variations, upload composed pin images
    │
    ▼
Pinterest scheduler   Posts to Pinterest at optimal times
```

## Prerequisites

- Node.js ≥ 20.10
- pnpm ≥ 9 (`corepack enable` then `corepack prepare pnpm@9.15.0 --activate`)
- Docker Desktop (for local Postgres + Langfuse)

## First-time setup

```bash
pnpm install
cp .env.example .env    # fill in real values
docker compose up -d    # starts postgres + langfuse
pnpm --filter @pa/shared-types build
```

## Daily workflow

```bash
pnpm dev                # runs pinterest-svc + carmen-web in parallel
pnpm test               # all workspace tests
pnpm typecheck          # all workspaces
docker compose logs -f  # container logs
docker compose down     # stop containers
```

- Backend: http://localhost:3001 (health at `/health`)
- Frontend: http://localhost:3000
- Langfuse: http://localhost:3100

## Environment variables

See `.env.example` for the full list. Notable feature flags:

| Flag | Default | Meaning |
| --- | --- | --- |
| `SCHEDULER_AUTO_POST` | `false` | Post to Pinterest without manual confirm |
| `HUMANIZE_ENABLED` | `false` | Route drafts through Undetectable.ai (opt-in) |
| `STRIP_EXIF` | `true` | Remove EXIF metadata from images before upload |
| `MONTHLY_IDEOGRAM_SPEND_CAP_USD` | `60` | Hard stop on image generation spend |

## Deployment

- **Backend**: Railway — reads `railway.json`, provisions Postgres, uses `apps/pinterest-svc/Dockerfile`
- **Frontend**: Vercel — project root `apps/carmen-web`

## Conventions

- TypeScript strict; Zod at every external boundary
- Secrets never committed; `.env` is gitignored
- One Drizzle migration per feature; migrations in `apps/pinterest-svc/drizzle/`
- LLM calls traced via Langfuse; errors reported to Sentry
