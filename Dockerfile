# carbon — container image
# Build host may be Apple Silicon; the cluster is linux/amd64 — always pass
# --platform linux/amd64 locally, or build via GHA (amd64 runners, no emulation).

FROM node:22.20-alpine AS deps
WORKDIR /app
# toolchain for native modules (better-sqlite3 compiles when no musl prebuilt exists)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22.20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# call next directly: package scripts are thin aliases to `task`, which the
# container deliberately doesn't carry
RUN ./node_modules/.bin/next build

FROM node:22.20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CARBON_DB=/data/carbon.db

# better-sqlite3 ships a prebuilt binding for this ABI via npm ci in deps;
# copy the full node_modules (standalone tracing misses native modules).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# seed corpus: the server re-syncs data/ into sqlite at boot
COPY --from=builder /app/data ./data

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "server.js"]
