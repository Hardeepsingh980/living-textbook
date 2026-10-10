# Living Book — single Cloud Run service: API + pipeline + built web app.
FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/scene/package.json packages/scene/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY spikes/tracking/package.json spikes/tracking/
COPY eval/package.json eval/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter @living-book/web build && pnpm --filter @living-book/server build

FROM node:24-slim
RUN corepack enable && corepack prepare pnpm@9.4.0 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/scene/package.json packages/scene/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY spikes/tracking/package.json spikes/tracking/
COPY eval/package.json eval/
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @living-book/server... \
 && cd node_modules/.pnpm/sharp*/node_modules/sharp && npm run install --silent 2>/dev/null || true
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY packages/scene/src ./packages/scene/src
WORKDIR /app/apps/server
ENV PORT=8080 WEB_DIST=/app/apps/web/dist DATA_DIR=/tmp/living-book-data
EXPOSE 8080
CMD ["node", "dist/index.mjs"]
