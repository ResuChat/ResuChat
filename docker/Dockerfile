FROM docker.m.daocloud.io/library/node:22-bookworm-slim AS base
WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build-server
COPY . .
RUN pnpm build:server

FROM deps AS build-web
COPY . .
RUN pnpm build:web

FROM base AS server
ENV NODE_ENV=production
COPY --from=build-server /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build-server /app/packages/server/package.json packages/server/package.json
COPY --from=build-server /app/packages/shared/package.json packages/shared/package.json
COPY --from=build-server /app/packages/shared/dist packages/shared/dist
COPY --from=build-server /app/packages/web/package.json packages/web/package.json
COPY --from=build-server /app/packages/server/dist packages/server/dist
COPY --from=build-server /app/packages/server/src/db packages/server/src/db
COPY --from=build-server /app/packages/server/drizzle.config.ts packages/server/drizzle.config.ts
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @resuchat/server...
WORKDIR /app/packages/server
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM docker.m.daocloud.io/library/nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-web /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
