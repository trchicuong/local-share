# ==========================================
# Multi-Stage Dockerfile for Local Share (LoS)
# Generic Linux (ARM64 & AMD64)
# ==========================================

# --- Stage 1: Build Frontend PWA ---
FROM node:22-alpine AS builder

WORKDIR /build

COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# --- Stage 2: Production Image ---
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server/ ./server/
COPY --from=builder /build/client/dist ./client/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

USER node

CMD ["node", "server/src/index.js"]
