# CloudBrowse Remote Browser Worker
#
# Ships Playwright with Chromium. Deploy to Railway, Fly.io, Render, Docker on
# a VPS, etc. The Vercel/FastAPI frontend talks to this service via HTTP.
#
# Build:   docker build -t cloudbrowse-worker .
# Run:     docker run --rm -p 8080:8080 -e WORKER_SHARED_TOKEN=change-me cloudbrowse-worker
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

# Install deps first for better caching
COPY package.json yarn.lock* ./
RUN (yarn install --frozen-lockfile || yarn install) && yarn cache clean

# App source
COPY server.js ./

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080
CMD ["node", "server.js"]
