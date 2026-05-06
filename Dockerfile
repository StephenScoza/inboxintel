FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY tests ./tests
COPY .env.example ./
COPY README.md ./

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3217

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
