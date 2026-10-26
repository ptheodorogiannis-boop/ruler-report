# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npm run build

# runtime: the Playwright image ships Chromium and its fonts for the PDF service (spec v3 §4.1); Node 22 included
FROM mcr.microsoft.com/playwright:v1.64.1-noble
WORKDIR /app
ENV NODE_ENV=production PORT=3100 DATABASE_URL=file:/data/ruler-reports.db PDF_ENABLED=auto PDF_BASE_URL=http://127.0.0.1:3100
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /data
COPY --from=build /app /app
VOLUME ["/data"]
EXPOSE 3100
ENTRYPOINT ["sh", "scripts/docker-entrypoint.sh"]
