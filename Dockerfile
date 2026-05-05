FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY .env.example ./
COPY README.md ./

EXPOSE 3000

CMD ["npm", "run", "dev"]
