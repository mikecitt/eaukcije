FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# backend rarely changes; frontend changes most often — order optimises layer cache
COPY backend/  ./backend/
COPY frontend/ ./frontend/

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
