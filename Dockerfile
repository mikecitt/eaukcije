# ── Build stage: compile better-sqlite3 native addon ──────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

# better-sqlite3 native addon requires libstdc++ at runtime
RUN apk add --no-cache libstdc++

COPY --from=builder /app/node_modules ./node_modules
# backend rarely changes; frontend changes most often — order optimises layer cache
COPY backend/  ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /app/data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
