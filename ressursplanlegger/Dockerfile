FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
ENV DATABASE_URL="file:/data/app.db"
RUN npx prisma generate && npm run build

EXPOSE 3000

CMD ["sh", "-c", "mkdir -p /data && npx prisma db push && npx tsx prisma/seed.ts && npm start"]
