FROM oven/bun:1 AS base
WORKDIR /app

# Copy workspace root and shared package
COPY package.json ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot

# Install dependencies
RUN bun install --frozen-lockfile

WORKDIR /app/packages/bot

CMD ["bun", "run", "src/index.ts"]
