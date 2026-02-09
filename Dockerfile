FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production 2>/dev/null || npm install --production

# Copy application code
COPY src/ ./src/
COPY config/ ./config/
COPY ingest/ ./ingest/
COPY data/ ./data/
COPY udf/ ./udf/
COPY db/ ./db/
COPY scripts/entrypoint.sh ./entrypoint.sh

# Create audit directory and install curl for health checks
RUN mkdir -p /app/audit && chmod +x /app/entrypoint.sh
RUN apk add --no-cache curl

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -sf http://localhost:8080/ping || exit 1

CMD ["/app/entrypoint.sh"]
