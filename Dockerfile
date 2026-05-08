FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY prisma/ ./prisma/
RUN npm ci
COPY backend/src/ ./backend/src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY prisma/ ./prisma/
RUN npm ci --omit=dev && npx prisma generate
COPY --from=builder /app/backend/dist ./backend/dist
COPY frontend/ ./frontend/
ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node backend/dist/main.js"]
