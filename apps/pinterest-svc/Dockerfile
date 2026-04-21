FROM node:20-alpine AS base
RUN apk add --no-cache exiftool
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/pinterest-svc/package.json apps/pinterest-svc/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/pinterest-svc/node_modules ./apps/pinterest-svc/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/pinterest-svc ./apps/pinterest-svc
RUN pnpm --filter @pa/shared-types build && pnpm --filter @pa/pinterest-svc build

FROM node:20-alpine AS runtime
RUN apk add --no-cache exiftool tini
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
ENV PINTEREST_SVC_PORT=3001
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/pinterest-svc/dist/index.js"]
