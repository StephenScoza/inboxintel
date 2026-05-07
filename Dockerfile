FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

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
