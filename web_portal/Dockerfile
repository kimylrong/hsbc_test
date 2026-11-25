# syntax=docker/dockerfile:1

# ---- Dependencies ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:22-alpine AS builder
WORKDIR /app

ARG PY_BACKEND_URL=http://property-value-estimator:8020
ARG JAVA_BACKEND_URL=http://property-market-analysis:8030
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
    PORT=8000 \
    HOSTNAME=0.0.0.0

ARG PY_BACKEND_URL=http://property-value-estimator:8020
ARG JAVA_BACKEND_URL=http://property-market-analysis:8030
ENV PY_BACKEND_URL=$PY_BACKEND_URL \
    JAVA_BACKEND_URL=$JAVA_BACKEND_URL

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8000

CMD ["node", "server.js"]
