# Multi-stage Dockerfile for Affilitics.co
# Optimized for Coolify deployment with Node.js 20

# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/db/package.json ./packages/db/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

# Copy source code
COPY . .

# Generate Prisma Client
WORKDIR /app/packages/db
RUN pnpm prisma generate

# Build packages and apps
WORKDIR /app
RUN pnpm run build

# Stage 3: Web Runner
FROM node:20-alpine AS web-runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl openssl-dev libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/apps/web/next.config.js ./apps/web/
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

# Stage 4: Worker Runner
FROM node:20-alpine AS worker-runner
WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl openssl-dev libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 worker

# Copy worker files
COPY --from=builder /app/apps/worker ./apps/worker
COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/node_modules ./node_modules

# Set correct permissions
RUN chown -R worker:nodejs /app

USER worker

CMD ["node", "apps/worker/enhanced-worker.js"]
