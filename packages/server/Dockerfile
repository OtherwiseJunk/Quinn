FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root and shared package
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Install dependencies
RUN bun install --frozen-lockfile

WORKDIR /app/packages/server

CMD ["bun", "run", "src/index.ts"]
