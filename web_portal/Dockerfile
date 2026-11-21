# syntax=docker/dockerfile:1

# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Next.js bakes rewrites destinations into the build output at build time,
# so the backend URLs must be supplied as build args (not runtime env).
ARG PY_BACKEND_URL=http://localhost:8001
ARG JAVA_BACKEND_URL=http://localhost:8080
ENV PY_BACKEND_URL=$PY_BACKEND_URL \
    JAVA_BACKEND_URL=$JAVA_BACKEND_URL \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Runtime URLs used by server-side prefetch (React Server Components).
# Defaults mirror the build args above.
ARG PY_BACKEND_URL=http://localhost:8001
ARG JAVA_BACKEND_URL=http://localhost:8080
ENV PY_BACKEND_URL=$PY_BACKEND_URL \
    JAVA_BACKEND_URL=$JAVA_BACKEND_URL

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]