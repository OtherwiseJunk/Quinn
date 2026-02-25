FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui

RUN bun install --frozen-lockfile

WORKDIR /app/packages/ui
RUN bun run build

FROM nginx:alpine AS production
COPY --from=builder /app/packages/ui/dist /usr/share/nginx/html
COPY packages/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
